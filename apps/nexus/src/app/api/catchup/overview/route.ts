import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  listActiveJourneys,
  getCatchupBacklog,
} from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { computeCatchupPace } from '@/lib/catchup-pace';

export const dynamic = 'force-dynamic';

/**
 * GET /api/catchup/overview?classroomId=
 *
 * Staff view of every catch-up journey in a classroom: who is behind, what each
 * student still owes class by class, and which classes nobody can catch up on
 * because there is no recording.
 *
 * The whole screen in one payload. A student-by-class matrix built from N+1
 * requests would be slow to draw and slower to reason about.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();

    // Gate on the capability, never on user_type === 'admin': the staff tiers
    // exist precisely so a manager can do coordination work without being an
    // admin.
    if (!staff || !canUser(staff, 'coord.attendance.view')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    let classroomId = request.nextUrl.searchParams.get('classroomId');
    if (!classroomId) {
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('id')
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      classroomId = classroom?.id || null;
    }
    if (!classroomId) {
      return NextResponse.json({ students: [], classes: [], noRecording: [], classroomId: null });
    }

    const journeys = await listActiveJourneys({ classroomId, limit: 200 }, supabase);
    if (journeys.length === 0) {
      return NextResponse.json({ students: [], classes: [], noRecording: [], classroomId });
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, avatar_url')
      .in(
        'id',
        journeys.map((j: any) => j.student_id),
      );
    const userById = new Map<string, { name: string | null; email: string | null; avatar_url: string | null }>(
      (users || []).map((u: any) => [u.id as string, u]),
    );

    // Every class any of them owes, so the matrix has a stable column set.
    const classColumns = new Map<string, { id: string; title: string | null; scheduled_date: string }>();
    const noRecording = new Map<
      string,
      { id: string; title: string | null; scheduled_date: string; affected: number }
    >();

    const students = [];
    for (const journey of journeys) {
      const backlog = await getCatchupBacklog(journey.student_id, journey.classroom_id, supabase);
      if (!backlog) continue;

      const quota = journey.weekly_quota ?? 2;
      const pace = computeCatchupPace({
        started_on: journey.started_on,
        weekly_quota: quota,
        total_items: backlog.totals.total,
        completed_items: backlog.totals.completed,
      });

      for (const item of backlog.items) {
        classColumns.set(item.scheduled_class_id, {
          id: item.scheduled_class_id,
          title: item.class.title,
          scheduled_date: item.class.scheduled_date,
        });
        if (item.status === 'blocked') {
          const prev = noRecording.get(item.scheduled_class_id);
          noRecording.set(item.scheduled_class_id, {
            id: item.scheduled_class_id,
            title: item.class.title,
            scheduled_date: item.class.scheduled_date,
            affected: (prev?.affected || 0) + 1,
          });
        }
      }

      const user = userById.get(journey.student_id);
      students.push({
        journey_id: journey.id,
        student: {
          id: journey.student_id,
          name: user?.name ?? null,
          email: user?.email ?? null,
          avatar_url: user?.avatar_url ?? null,
        },
        started_on: journey.started_on,
        weekly_quota: quota,
        totals: backlog.totals,
        pace,
        items: backlog.items.map((i) => ({
          id: i.id,
          scheduled_class_id: i.scheduled_class_id,
          status: i.status,
          step: i.step,
          watched: i.watched,
          assignments_outstanding: i.assignments_outstanding,
          assignments_total: i.assignments_total,
          has_test: i.has_test,
          test_passed: i.test_passed,
          excused: i.excused,
        })),
      });
    }

    // Most-behind first: the list is a work queue, not a register.
    students.sort((a, b) => b.pace.deficit - a.pace.deficit);

    const classes = [...classColumns.values()].sort((a, b) =>
      String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
    );

    return NextResponse.json({
      classroomId,
      students,
      classes,
      noRecording: [...noRecording.values()].sort((a, b) =>
        String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the catch-up overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
