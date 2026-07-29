import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getClassPrepTest, loadClassPrepRoster } from '@neram/database';
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
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveClassStaffAccess<RosterClass>(
      supabase,
      msUser.oid,
      params.classId,
      'id, classroom_id, teacher_id, title',
    );
    if ('error' in access) return access.error;
    // Read-only, so canEdit is not required: any staff member who can see the
    // classroom may see who is ready. Only WRITING a prep test needs canEdit.

    const [enrollmentsRes, states, prepTest, preworkRes, attendanceRes] = await Promise.all([
      supabase
        .from('nexus_enrollments')
        .select('user_id, user:users!nexus_enrollments_user_id_fkey(id, name, avatar_url)')
        .eq('classroom_id', access.cls.classroom_id)
        .eq('role', 'student')
        .eq('is_active', true),
      loadClassPrepRoster(params.classId, supabase),
      getClassPrepTest(params.classId, supabase),
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

    const students = ((enrollmentsRes.data || []) as any[])
      .filter((e) => e.user)
      .map((e) => ({
        student_id: e.user.id as string,
        name: (e.user.name as string) ?? null,
        avatar_url: (e.user.avatar_url as string) ?? null,
      }));

    // A row absent from this map is NOT MEASURED, which is why it is a Map rather
    // than a boolean defaulted to false.
    const attendance = new Map<string, boolean>();
    for (const a of (attendanceRes.data || []) as any[]) {
      attendance.set(a.student_id, !!a.attended);
    }

    const rows = buildPrepRoster({
      students,
      states: states as any,
      hasTest: !!prepTest,
      preworkRequired: (preworkRes.data || []).length,
      attendance,
    });

    const summary = summarisePrepRoster(rows);

    return NextResponse.json({
      class_title: access.cls.title,
      has_test: !!prepTest,
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
    const message = err instanceof Error ? err.message : 'Failed to load the roster';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
