import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getCurrentBatch } from '@neram/database';
import { pickClassroomEmail } from '@/lib/classroom-email';

/**
 * GET /api/students?classroom={id}&search={query}&batch={batchId|unassigned}&examBatch={code|current|none}
 *
 * List enrolled students for a classroom with attendance and checklist stats.
 *
 * Two independent "batch" axes (do not confuse them):
 *   - `batch`     = the classroom SECTION (nexus_enrollments.batch_id -> nexus_batches)
 *   - `examBatch` = the EXAM-YEAR COHORT (users.academic_year, e.g. '2026-27')
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom');
    const search = request.nextUrl.searchParams.get('search');
    const batchFilter = request.nextUrl.searchParams.get('batch');
    const examBatchParam = request.nextUrl.searchParams.get('examBatch');
    // Nexus is an organisation (Microsoft-only) app: by default the roster shows
    // only students who hold a real org identity (ms_oid => @neramclasses.com or the
    // pending .onmicrosoft.com). Gmail-only self-enrolled shells (firebase_uid, no
    // ms_oid) can't even log into Nexus, so they are hidden here (Admin keeps them
    // visible for linking/merge). Pass includeNonOrg=1 to opt out (tests/admin).
    const includeNonOrg = request.nextUrl.searchParams.get('includeNonOrg') === '1';

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
    let enrollmentQuery = supabase
      .from('nexus_enrollments')
      .select('user_id, enrolled_at, batch_id, user:users!nexus_enrollments_user_id_fkey!inner(id, name, email, personal_email, linked_classroom_email, avatar_url, ms_oid, nexus_access_enabled, academic_year, is_alumni), batch:nexus_batches(id, name)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true)
      .eq('users.is_alumni', false);

    // Org-identity gate (see includeNonOrg above). Same rule already applied to
    // staff in lib/nexus-members.ts (isLicensedStaff requires a real ms_oid).
    if (!includeNonOrg) {
      enrollmentQuery = enrollmentQuery.not('users.ms_oid', 'is', null);
    }

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
      return NextResponse.json({ students: [], batches: [], currentBatch: currentCode });
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
        nexus_access_enabled: user.nexus_access_enabled ?? false,
        exam_batch: user.academic_year ?? null,
        enrolled_at: enrollment.enrolled_at,
        batch: batch ? { id: batch.id, name: batch.name } : null,
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

    return NextResponse.json({ students, batches: batches || [], currentBatch: currentCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load students';
    console.error('Students GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
