import { NextRequest, NextResponse } from 'next/server';
import { classPracticeDates, getSketchbookGoalHistory, loadClassroomRoster } from '@neram/database/queries/nexus';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import { addDays, computeRhythm, istDate, weekStart } from '@/lib/sketchbook-rhythm';

/**
 * GET /api/sketchbook/class-rhythm?classroom=<id>   (staff)
 *
 * Every tracked student in the classroom with this week's dots and their run.
 * Dormant students are included and flagged so the list can grey them; the
 * screen sorts quiet-first because the quiet ones are who a teacher is
 * looking for.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) throw new ApiError('Missing classroom', 400);
    const mine = await staffClassroomIds(caller);
    if (!mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);

    const today = istDate(new Date());
    const since = addDays(weekStart(today), -7 * 8);
    const [roster, history, { data: classroom, error: classroomError }] = await Promise.all([
      loadClassroomRoster(classroomId, { includeDormant: true }),
      getSketchbookGoalHistory(classroomId),
      getSupabaseAdminClient().from('nexus_classrooms').select('sketchbook_weekly_goal').eq('id', classroomId).maybeSingle(),
    ]);
    if (classroomError) throw classroomError;
    const goal = (classroom as { sketchbook_weekly_goal?: number } | null)?.sketchbook_weekly_goal ?? 3;
    const dates = await classPracticeDates(roster.members.map((m) => m.user_id), since);

    const students = roster.members.map((m) => {
      const r = computeRhythm(dates[m.user_id] || [], today, history, goal);
      return {
        userId: m.user_id,
        name: m.user.name,
        avatarUrl: m.user.avatar_url,
        msOid: m.user.ms_oid,
        dormant: m.participation_status === 'dormant',
        week: r.week.days,
        count: r.week.count,
        run: r.run,
        lastPracticeDate: r.lastPracticeDate,
        quietDays: r.quietDays,
      };
    });
    return NextResponse.json({ goal, students }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the class rhythm');
  }
}
