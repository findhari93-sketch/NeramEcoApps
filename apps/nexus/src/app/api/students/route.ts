import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient, getCurrentBatch, isTracked } from '@neram/database';
import { pickClassroomEmail } from '@/lib/classroom-email';
import { isAwaitingMicrosoft } from '@/lib/microsoft-account';
import {
  matchesSegment,
  segmentCounts,
  stageCounts,
  stageKeyOf,
  type StageFacts,
  type StudentSegment,
} from '@/lib/student-stage';

const SEGMENTS: readonly string[] = [
  'exam_this_year',
  'all_active',
  '11th',
  'lower',
  'unset',
  'dormant',
];

/**
 * GET /api/students?classroom={id}&search={query}&batch={batchId|unassigned}
 *                  &examBatch={code|current|none|all}&segment={segment}
 *                  &stage={csv}&participation={active|dormant|any}
 *
 * List enrolled students for a classroom with attendance and checklist stats.
 *
 * Three independent axes (do not confuse them):
 *   - `batch`     = the classroom SECTION (nexus_enrollments.batch_id -> nexus_batches)
 *   - `examBatch` = the EXAM-YEAR COHORT (users.academic_year, e.g. '2026-27')
 *   - `stage`     = the STUDY STAGE (nexus_enrollments.current_standard), which
 *                   with participation_status drives the segment bar.
 *
 * This is the ONE route that deliberately returns dormant students: they must
 * still be findable and reactivatable, they just live behind their own segment.
 * Every other monitoring surface uses loadClassroomRoster, which drops them.
 *
 * Segment counts are computed over the COMPLETE roster before any segment
 * narrowing, so the pill counts stay honest no matter which pill is active. The
 * client filters rows with the same matchesSegment(), so the header count and
 * the list length cannot disagree.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    // Staff-only: this returns the full roster with emails, personal emails and
    // phone numbers. It previously verified the token but never checked the role,
    // so any student's token returned every classmate's contact details.
    assertCapability(caller, 'coord.student.view');

    const classroomId = request.nextUrl.searchParams.get('classroom');
    const search = request.nextUrl.searchParams.get('search');
    const batchFilter = request.nextUrl.searchParams.get('batch');
    const segmentParam = request.nextUrl.searchParams.get('segment');
    const stageParam = request.nextUrl.searchParams.get('stage');
    const participationParam = request.nextUrl.searchParams.get('participation');
    let examBatchParam = request.nextUrl.searchParams.get('examBatch');

    const segment: StudentSegment | null =
      segmentParam && SEGMENTS.includes(segmentParam) ? (segmentParam as StudentSegment) : null;

    // users.academic_year is noisy: one classroom legitimately carries NULL,
    // 2025-26, 2026-27, 2027-28 and 2028-29 at once. The default 'current'
    // cohort filter would therefore hide some of the very students the "Not set"
    // and "Dormant" segments exist to surface, and the pill count would not
    // match the list. Those two segments are about fixing data, so the cohort
    // narrowing is dropped for them.
    if (segment === 'unset' || segment === 'dormant') examBatchParam = 'all';

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Source of truth for the "current" exam-year cohort. Nexus only manages
    // students who still hold access = current exam year + future years.
    const currentCode = (await getCurrentBatch()).code;

    // Get student enrollments with user info, classroom section (batch) and exam year (academic_year).
    // Hard-exclude graduated students (users.is_alumni) and deactivated enrollments (is_active):
    // once a student is graduated in Admin they lose Nexus access and must not appear here.
    //
    // Students with no ms_oid are deliberately KEPT. They are enrolled (usually a
    // new joinee who paid through the marketing link before their
    // @neramclasses.com mailbox existed) and staff need to see they are waiting
    // rather than have them vanish. Each row carries `awaiting_microsoft` and they
    // are counted separately, so they never inflate "N active". See
    // lib/microsoft-account.ts.
    //
    // The `user:users!nexus_enrollments_user_id_fkey` hint is mandatory, not
    // stylistic: nexus_enrollments references users FOUR times (user_id,
    // removed_by, dormant_by, current_standard_set_by), so a bare embed is
    // ambiguous and PostgREST rejects it.
    let enrollmentQuery = supabase
      .from('nexus_enrollments')
      .select('id, user_id, enrolled_at, batch_id, is_active, current_standard, current_standard_source, current_standard_set_at, participation_status, dormant_since, dormant_reason, user:users!nexus_enrollments_user_id_fkey!inner(id, name, email, personal_email, linked_classroom_email, avatar_url, ms_oid, nexus_access_enabled, academic_year, is_alumni), batch:nexus_batches(id, name)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true)
      .eq('users.is_alumni', false);

    if (search) {
      enrollmentQuery = enrollmentQuery.ilike('users.name', `%${search}%`);
    }

    if (batchFilter) {
      if (batchFilter === 'unassigned') {
        enrollmentQuery = enrollmentQuery.is('batch_id', null);
      } else {
        enrollmentQuery = enrollmentQuery.eq('batch_id', batchFilter);
      }
    }

    // Explicit stage / participation narrowing for API consumers and for the day
    // a classroom is 300 students rather than 28. The segment bar itself filters
    // client-side off the complete roster so the counts stay honest.
    if (stageParam) {
      const wanted = stageParam.split(',').map((s) => s.trim()).filter(Boolean);
      const settable = wanted.filter((s) => s !== 'unset');
      if (wanted.includes('unset') && !settable.length) {
        enrollmentQuery = enrollmentQuery.is('current_standard', null);
      } else if (settable.length && !wanted.includes('unset')) {
        enrollmentQuery = enrollmentQuery.in('current_standard', settable);
      }
    }

    if (participationParam === 'active' || participationParam === 'dormant') {
      enrollmentQuery = enrollmentQuery.eq('participation_status', participationParam);
    }

    // Exam-year cohort filter (users.academic_year), independent of the classroom section.
    // An explicit year selection ('none' or a specific code) narrows further; when no
    // specific year is chosen we default to the ACTIVE cohort (current + future + untagged),
    // applied in JS below so alumni/past cohorts never leak in.
    if (examBatchParam === 'none') {
      enrollmentQuery = enrollmentQuery.is('users.academic_year', null);
    } else if (examBatchParam && examBatchParam !== 'all' && examBatchParam !== 'current') {
      enrollmentQuery = enrollmentQuery.eq('users.academic_year', examBatchParam);
    }

    const { data: rawEnrollments, error: enrollmentError } = await enrollmentQuery;

    if (enrollmentError) throw enrollmentError;

    // Access is defined by the LICENSE (active enrollment in an active classroom +
    // non-alumni), exactly like /api/auth/me. So the default view shows EVERY
    // licensed student regardless of exam year: the moment a teacher adds a
    // student to the class they must appear here, even if their academic_year is
    // an older cohort (e.g. a 2025-26 student re-added to the current class).
    // The exam-year cohort is only an OPTIONAL narrowing: 'current' keeps just
    // current + future + untagged (academic_year is 'YYYY-YY' so lexical >= works).
    const applyActiveCohort = examBatchParam === 'current';
    const enrollments = (rawEnrollments || []).filter((e: any) => {
      if (!applyActiveCohort) return true;
      const y: string | null = e.user?.academic_year ?? null;
      return y === null || y >= currentCode;
    });

    if (enrollments.length === 0) {
      // Ship a fully-shaped counts object even when empty, so the client never
      // has to guess whether a missing key means zero or means stale payload.
      return NextResponse.json({
        students: [],
        counts: {
          total: 0,
          active: 0,
          awaitingMicrosoft: 0,
          tracked: 0,
          dormant: 0,
          stage: stageCounts([]),
          segments: segmentCounts([]),
        },
        batches: [],
        currentBatch: currentCode,
      });
    }

    const studentIds = enrollments.map((e: any) => e.user_id);

    // Fetch stats in parallel
    const [attendanceResult, totalClassesResult, checklistTotalResult, checklistProgressResult, profileEmailResult] =
      await Promise.all([
        // Attendance records for all students in this classroom's classes
        supabase
          .from('nexus_attendance')
          .select('student_id, attended')
          .in('student_id', studentIds),

        // Total completed classes in classroom
        supabase
          .from('nexus_scheduled_classes')
          .select('id', { count: 'exact', head: true })
          .eq('classroom_id', classroomId)
          .eq('status', 'completed'),

        // Total active checklist items
        supabase
          .from('nexus_checklist_items')
          .select('id', { count: 'exact', head: true })
          .eq('classroom_id', classroomId)
          .eq('is_active', true),

        // Checklist progress for all students
        supabase
          .from('nexus_student_checklist_progress')
          .select('student_id, checklist_item:nexus_checklist_items!inner(classroom_id)')
          .in('student_id', studentIds)
          .eq('is_completed', true)
          .eq('nexus_checklist_items.classroom_id', classroomId),

        // Classroom (Teams) email per student, used to prefer the @neramclasses.com
        // identity over the personal Gmail stored in users.email.
        supabase
          .from('student_profiles')
          .select('user_id, ms_teams_email')
          .in('user_id', studentIds),
      ]);

    if (attendanceResult.error) throw attendanceResult.error;
    if (totalClassesResult.error) throw totalClassesResult.error;
    if (checklistTotalResult.error) throw checklistTotalResult.error;
    if (checklistProgressResult.error) throw checklistProgressResult.error;

    // Map user_id -> ms_teams_email (classroom address).
    const msTeamsByUser = (profileEmailResult.data || []).reduce(
      (acc: Record<string, string | null>, row: any) => {
        acc[row.user_id] = row.ms_teams_email ?? null;
        return acc;
      },
      {} as Record<string, string | null>,
    );

    const totalClasses = totalClassesResult.count || 0;
    const totalChecklistItems = checklistTotalResult.count || 0;

    // Build attendance stats per student
    const attendanceByStudent = (attendanceResult.data || []).reduce(
      (acc: Record<string, { attended: number; total: number }>, row: any) => {
        if (!acc[row.student_id]) acc[row.student_id] = { attended: 0, total: 0 };
        acc[row.student_id].total += 1;
        if (row.attended) acc[row.student_id].attended += 1;
        return acc;
      },
      {} as Record<string, { attended: number; total: number }>,
    );

    // Build checklist stats per student
    const checklistByStudent = (checklistProgressResult.data || []).reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.student_id] = (acc[row.student_id] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const students = enrollments.map((enrollment: any) => {
      const userId = enrollment.user_id;
      const user = enrollment.user as unknown as {
        id: string;
        name: string;
        email: string | null;
        personal_email: string | null;
        linked_classroom_email: string | null;
        avatar_url: string | null;
        ms_oid: string | null;
        nexus_access_enabled: boolean | null;
        academic_year: string | null;
      };
      const attendance = attendanceByStudent[userId] || { attended: 0, total: 0 };

      const batch = (enrollment as any).batch as { id: string; name: string } | null;

      // Prefer the @neramclasses.com class identity over the personal Gmail that
      // still sits in users.email for many students. email_status lets the UI flag
      // anyone still on the default onmicrosoft domain or with no class email yet.
      const { email: classroomEmail, status: emailStatus } = pickClassroomEmail({
        ms_teams_email: msTeamsByUser[userId],
        linked_classroom_email: user.linked_classroom_email,
        email: user.email,
      });

      return {
        id: user.id,
        name: user.name,
        email: classroomEmail ?? user.personal_email ?? user.email ?? null,
        email_status: emailStatus,
        avatar_url: user.avatar_url,
        ms_oid: user.ms_oid,
        awaiting_microsoft: isAwaitingMicrosoft(user.ms_oid),
        nexus_access_enabled: user.nexus_access_enabled ?? false,
        exam_batch: user.academic_year ?? null,
        enrolled_at: enrollment.enrolled_at,
        batch: batch ? { id: batch.id, name: batch.name } : null,
        // Two orthogonal axes. A student can be Class 11 AND dormant, so these
        // are never folded into a single field.
        study_stage: enrollment.current_standard ?? null,
        study_stage_source: enrollment.current_standard_source ?? null,
        study_stage_set_at: enrollment.current_standard_set_at ?? null,
        participation_status: enrollment.participation_status ?? 'active',
        dormant_since: enrollment.dormant_since ?? null,
        dormant_reason: enrollment.dormant_reason ?? null,
        attendance: {
          attended: attendance.attended,
          total: totalClasses,
          percentage:
            totalClasses > 0 ? Math.round((attendance.attended / totalClasses) * 100) : 0,
        },
        checklist: {
          completed: checklistByStudent[userId] || 0,
          total: totalChecklistItems,
        },
      };
    });

    // Fetch batches for this classroom
    const { data: batches } = await supabase
      .from('nexus_batches')
      .select('id, name')
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .order('name');

    // Split counts so the header can say "N active" honestly. `active` is the
    // number who can actually sign in today; `awaitingMicrosoft` is the queue of
    // paid students still waiting on Entra provisioning.
    const awaitingMicrosoft = students.filter((s: any) => s.awaiting_microsoft).length;

    // Counted over the COMPLETE roster, deliberately before the segment
    // narrowing below, so every pill shows its true size whichever pill is
    // active. isTracked is imported rather than reimplemented: it is the single
    // written-down definition of "counts towards this classroom's numbers".
    const facts: StageFacts[] = enrollments.map((e: any) => ({
      stage: stageKeyOf(e.current_standard),
      dormant: e.participation_status === 'dormant',
    }));
    const trackedCount = enrollments.filter((e: any) => isTracked(e)).length;

    const counts = {
      total: students.length,
      active: students.length - awaitingMicrosoft,
      awaitingMicrosoft,
      tracked: trackedCount,
      dormant: students.length - trackedCount,
      stage: stageCounts(facts),
      segments: segmentCounts(facts),
    };

    // Server-side segment narrowing is applied LAST, after the counts, and only
    // when asked for. The screen normally filters client-side so that typing in
    // the search box does not cost a round trip.
    const visible = segment
      ? students.filter((s: any) =>
          matchesSegment(
            { stage: stageKeyOf(s.study_stage), dormant: s.participation_status === 'dormant' },
            segment,
          ),
        )
      : students;

    return NextResponse.json({
      students: visible,
      counts,
      batches: batches || [],
      currentBatch: currentCode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load students';
    console.error('Students GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
