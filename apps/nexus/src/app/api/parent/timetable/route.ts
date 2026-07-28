import { NextRequest, NextResponse } from 'next/server';
import { getParentUser, resolveChildContext } from '@/lib/parent-auth';
import { errorResponse } from '@/lib/api-errors';
import { summarise } from '@/lib/parent-attendance';
import { loadChildAttendance, loadUpcomingClasses, istDaysAgo } from '@/lib/parent-data';

/**
 * GET /api/parent/timetable?student=&days=
 *
 * The Classes tab: what is coming up, and for every class that has already
 * happened, whether the child was there and for how long.
 *
 * `recent` entries carry the raw join/leave segments so the UI can draw the
 * attendance strip. A class with measurement 'not_measured' has null for every
 * derived field and must render as "Not recorded", never as an absence.
 */

const DEFAULT_WINDOW_DAYS = 45;

export async function GET(request: NextRequest) {
  try {
    const parent = await getParentUser(request.headers.get('Authorization'));
    const { child, classroomId } = await resolveChildContext(
      parent.id,
      request.nextUrl.searchParams.get('student')
    );

    const days = Math.min(
      180,
      Math.max(7, Number(request.nextUrl.searchParams.get('days')) || DEFAULT_WINDOW_DAYS)
    );

    const [attendanceWindow, upcoming] = await Promise.all([
      loadChildAttendance(child.id, classroomId, istDaysAgo(days)),
      loadUpcomingClasses(classroomId, 10),
    ]);

    return NextResponse.json({
      child: {
        id: child.id,
        name: child.name,
        classroom_id: classroomId,
        classroom_name: child.classroom_name,
      },
      windowDays: days,
      upcoming,
      recent: attendanceWindow.views,
      summary: summarise(attendanceWindow.views),
    });
  } catch (err) {
    return errorResponse(err, 'Could not load the timetable');
  }
}
