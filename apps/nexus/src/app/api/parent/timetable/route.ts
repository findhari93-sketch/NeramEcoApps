import { NextRequest, NextResponse } from 'next/server';
import { getParentUser, resolveChildContext } from '@/lib/parent-auth';
import { errorResponse } from '@/lib/api-errors';
import { loadUpcomingClasses, istDaysAgo, istToday } from '@/lib/parent-data';
import { loadEnrollmentContext } from '@/lib/parent-enrollment';
import { loadParentClassWindow } from '@/lib/parent-classes';
import type { ParentTimetableResponse } from '@/lib/parent-view-types';

/**
 * GET /api/parent/timetable?student=&start=&end=      (calendar)
 * GET /api/parent/timetable?student=&days=            (legacy list)
 *
 * The Classes tab: what is coming up, what happened, and for every class that
 * has already run, whether the child was there and for how long.
 *
 * Reads nothing from /api/timetable. That route takes its scope from a
 * `?classroom=` query parameter and authorises by enrollment, which a parent can
 * never hold. Here the classroom is resolved server side from the parent-child
 * link, so a parent cannot ask for a classroom that is not their child's.
 *
 * WHY THIS PATH DID NOT GET RENAMED to /api/parent/classes when the calendar
 * landed: tests/e2e/parent-portal-nexus.spec.ts asserts against this URL that an
 * unsynced class is never reported as an absence. That is the single most
 * important guarantee the portal makes, and keeping the route means the
 * assertion keeps running against the thing it was written for rather than being
 * rewritten alongside the code it polices.
 *
 * `classes` carries STATUS ONLY: no recording url, no resource rows, no Teams
 * link. See lib/parent-classes.ts for the contract and the test that enforces it.
 */

/** The legacy list window. */
const DEFAULT_WINDOW_DAYS = 45;

/**
 * The widest span a single request may ask for: a month grid plus its spill
 * days, with room to spare. Without a ceiling a parent could request three years
 * in one call and turn a cheap indexed range scan into a table sweep.
 */
const MAX_SPAN_DAYS = 62;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
  );
}

export async function GET(request: NextRequest) {
  try {
    const parent = await getParentUser(request.headers.get('Authorization'));
    const params = request.nextUrl.searchParams;

    const { child, classroomId } = await resolveChildContext(
      parent.id,
      params.get('student')
    );

    // Sequential on purpose: scope.batchId decides which classes the window read
    // may even see, so it has to land before the reads below.
    const { enrollment, notice } = await loadEnrollmentContext(
      child.id,
      classroomId,
      child.name
    );
    const scope = { batchId: enrollment?.batch_id ?? null };

    const days = Math.min(
      180,
      Math.max(7, Number(params.get('days')) || DEFAULT_WINDOW_DAYS)
    );

    const rawStart = params.get('start');
    const rawEnd = params.get('end');
    const explicit = !!(rawStart && rawEnd && YMD.test(rawStart) && YMD.test(rawEnd));

    let start = explicit ? rawStart! : istDaysAgo(days);
    let end = explicit ? rawEnd! : istToday();

    if (end < start) [start, end] = [end, start];
    if (daysBetween(start, end) > MAX_SPAN_DAYS) end = addDays(start, MAX_SPAN_DAYS);

    const [window, upcoming] = await Promise.all([
      loadParentClassWindow(child.id, classroomId, scope, start, end),
      loadUpcomingClasses(classroomId, scope, 10),
    ]);

    const body: ParentTimetableResponse = {
      child: {
        id: child.id,
        name: child.name,
        avatar_url: child.avatar_url,
        classroom_id: classroomId,
        classroom_name: child.classroom_name,
      },
      /** Why the list may be short or empty. Null when the child is active. */
      notice,
      window: { start, end },
      classes: window.classes,
      summary: window.summary,
      attendanceSentence: window.attendanceSentence,
      markedDates: window.markedDates,
      holidays: window.holidays,

      // Compat with the pre-calendar page and the shipped E2E suite. `recent`
      // stays past-only and keeps the three-state honesty contract intact.
      windowDays: explicit ? daysBetween(start, end) : days,
      upcoming,
      recent: window.attendanceViews,
    };

    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err, 'Could not load the timetable');
  }
}
