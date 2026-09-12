import { NextRequest, NextResponse } from 'next/server';
import { setSketchbookWeeklyGoal } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import { istDate, weekStart } from '@/lib/sketchbook-rhythm';

/**
 * PATCH /api/sketchbook/settings?classroom=<id>  body { weekly_goal: 1..7 }   (staff)
 * Applies from this week's Monday; earlier weeks keep the goal they were judged by.
 */
export async function PATCH(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) throw new ApiError('Missing classroom', 400);
    const mine = await staffClassroomIds(caller);
    if (!mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);
    const body = await request.json().catch(() => ({}));
    const goal = Number(body?.weekly_goal);
    if (!Number.isInteger(goal) || goal < 1 || goal > 7) throw new ApiError('weekly_goal must be a whole number from 1 to 7', 400);
    await setSketchbookWeeklyGoal(classroomId, goal, caller.id, weekStart(istDate(new Date())));
    return NextResponse.json({ goal }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not change the weekly goal');
  }
}
