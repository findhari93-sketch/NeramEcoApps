import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import {
  getSupabaseAdminClient,
  getClassPrepTest,
  getClassTest,
  getClassTestRoster,
  loadClassPrepRoster,
  loadClassroomRoster,
} from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { buildPrepRoster, summarisePrepRoster, prepRosterHeadline } from '@/lib/class-prep-roster';

/**
 * GET /api/timetable/[classId]/prep-roster   (staff)
 *
 * Who is ready for this class. The question a teacher asks ten minutes before it
 * starts, so this is deliberately cheap: three set-based queries whose cost does
 * not grow past the size of the roster, and no per-student fetch anywhere.
 *
 * Shaping is done by the pure buildPrepRoster, which is where the "no row means
 * not_started, never failed" and "no attendance row means not measured" rules
 * live and are unit tested.
 */

interface Ctx {
  params: { classId: string };
}

interface RosterClass {
  id: string;
  classroom_id: string;
  teacher_id: string | null;
  title: string | null;
  /** Needed to scope the roster to who was enrolled on the day. */
  scheduled_date: string | null;
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveClassStaffAccess<RosterClass>(
      supabase,
      msUser.oid,
      params.classId,
      'id, classroom_id, teacher_id, title, scheduled_date',
    );
    if ('error' in access) return access.error;
    // Read-only, so canEdit is not required: any staff member who can see the
    // classroom may see who is ready. Only WRITING a prep test needs canEdit.

    // Moving to the shared helper GAINS this route two filters it never had: it
    // previously counted graduated students, and it counted students who joined
    // after the class was scheduled. Both dragged the readiness rate down. It
    // also drops dormant students, who cannot meaningfully be "not ready".
    const [rosterRes, states, prepTest, classTest, preworkRes, attendanceRes] = await Promise.all([
      loadClassroomRoster(access.cls.classroom_id, {
        asOf: access.cls.scheduled_date,
        client: supabase,
      }),
      loadClassPrepRoster(params.classId, supabase),
      getClassPrepTest(params.classId, supabase),
      getClassTest(params.classId, supabase),
      supabase
        .from('nexus_class_assignments')
        .select('id')
        .eq('scheduled_class_id', params.classId)
        .eq('timing', 'prework')
        .eq('status', 'published'),
      supabase
        .from('nexus_attendance')
        .select('student_id, attended')
        .eq('scheduled_class_id', params.classId),
    ]);

    const students = rosterRes.members.map((e) => ({
      student_id: e.user.id,
      name: e.user.name ?? null,
      avatar_url: e.user.avatar_url ?? null,
      study_stage: e.current_standard,
    }));

    // A row absent from this map is NOT MEASURED, which is why it is a Map rather
    // than a boolean defaulted to false.
    const attendance = new Map<string, boolean>();
    for (const a of (attendanceRes.data || []) as any[]) {
      attendance.set(a.student_id, !!a.attended);
    }

    // Only read when a class test exists, so the overwhelming majority of
    // classes pay nothing for this feature.
    const classTestStanding = classTest
      ? await getClassTestRoster(
          params.classId,
          students.map((s) => s.student_id),
          supabase,
        )
      : null;

    const rows = buildPrepRoster({
      students,
      states: states as any,
      hasTest: !!prepTest,
      preworkRequired: (preworkRes.data || []).length,
      attendance,
      hasClassTest: !!classTest,
      classTest: classTestStanding
        ? new Map(
            [...classTestStanding.entries()].map(([id, r]) => [
              id,
              { best_pct: r.best_pct, attempts: r.attempts, passed: !!r.passed_at },
            ]),
          )
        : undefined,
    });

    const summary = summarisePrepRoster(rows);

    return NextResponse.json({
      class_title: access.cls.title,
      has_test: !!prepTest,
      has_class_test: !!classTest,
      class_test: classTest
        ? {
            title: classTest.title,
            passing_pct: classTest.passing_pct,
            question_count: classTest.question_count,
            must_get_right: classTest.must_get_right,
            due_at: classTest.due_at,
            required: classTest.required,
          }
        : null,
      test: prepTest
        ? {
            title: prepTest.title,
            passing_pct: prepTest.passing_pct,
            question_count: prepTest.question_count,
            must_get_right: prepTest.must_get_right,
          }
        : null,
      prework_required: (preworkRes.data || []).length,
      rows,
      summary,
      headline: prepRosterHeadline(summary),
    });
  } catch (err) {
    return errorResponse(err, 'Failed to load the roster');
  }
}
