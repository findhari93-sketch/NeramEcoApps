import { NextRequest, NextResponse } from 'next/server';
import { listAssignmentsForStudent } from '@neram/database';
import { getParentUser, resolveChildContext } from '@/lib/parent-auth';
import { errorResponse } from '@/lib/api-errors';
import { summarise, describeAttendance } from '@/lib/parent-attendance';
import { buildParentAssignmentViews, summariseAssignments } from '@/lib/parent-assignments';
import { loadChildAttendance, loadUpcomingClasses, istDaysAgo } from '@/lib/parent-data';
import { loadEnrollmentContext } from '@/lib/parent-enrollment';
import { loadChildCatchup } from '@/lib/parent-catchup';
import { resolveExamCountdown } from '@/lib/exam-countdown-server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/parent/overview?student=&days=
 *
 * Everything the parent home screen shows: one verdict, three numbers, and the
 * next class. Replaces /api/parent/progress, which used .single() on a
 * parent-scoped query and therefore threw a 401 for any parent with two
 * children, and which counted unsynced classes as absences.
 *
 * Per-user and per-child, so genuinely uncacheable. That is the documented
 * escape hatch in the Vercel cost rules, not an oversight.
 */

/** The window the home screen summarises. Long enough to show a trend. */
const DEFAULT_WINDOW_DAYS = 30;

export type VerdictBand = 'on_track' | 'slipping' | 'needs_attention' | 'not_enough_data';

export async function GET(request: NextRequest) {
  try {
    const parent = await getParentUser(request.headers.get('Authorization'));

    // resolveChildContext validates any requested student against the link set,
    // so it doubles as assertParentOf for this route.
    const { child, classroomId } = await resolveChildContext(
      parent.id,
      request.nextUrl.searchParams.get('student')
    );

    const days = Math.min(
      120,
      Math.max(7, Number(request.nextUrl.searchParams.get('days')) || DEFAULT_WINDOW_DAYS)
    );

    // Sequential on purpose: `scope.batchId` decides which classes the two class
    // reads below are even allowed to see, so it has to land first. One extra
    // round trip buys the guarantee that a parent can never be shown a draft
    // class or another batch's class.
    const { enrollment, notice } = await loadEnrollmentContext(
      child.id,
      classroomId,
      child.name
    );
    const scope = { batchId: enrollment?.batch_id ?? null };

    const [attendanceWindow, assignmentItems, upcoming, examCountdown, catchup] =
      await Promise.all([
      loadChildAttendance(child.id, classroomId, istDaysAgo(days), scope),
      listAssignmentsForStudent(child.id, classroomId).catch(() => []),
      loadUpcomingClasses(classroomId, scope, 3),
      // Days left until the child's exam. resolveChildContext has already proved
      // this parent is linked to this student, so passing the child id here is
      // safe; it is what lets the child's own booked slot outrank the cohort date.
      resolveExamCountdown(getSupabaseAdminClient(), {
        classroomId,
        studentId: child.id,
      }),
      /**
       * How much of what they missed they have made up. Read only: this must
       * never call getCatchupBacklog, which UPDATEs while it reads. A parent
       * opening a dashboard cannot be allowed to mutate their child's records.
       */
      loadChildCatchup(child.id, classroomId),
    ]);

    const attendance = summarise(attendanceWindow.views);
    const assignmentViews = buildParentAssignmentViews(assignmentItems as never[]);
    const assignments = summariseAssignments(assignmentViews);

    return NextResponse.json({
      child: {
        id: child.id,
        name: child.name,
        avatar_url: child.avatar_url,
        classroom_id: classroomId,
        classroom_name: child.classroom_name,
      },
      /**
       * Why the numbers below may be empty: paused, ended, or joined late. Null
       * when the child is simply active. Carried on every parent response so the
       * pages cannot disagree about the child's standing.
       */
      notice,
      windowDays: days,
      attendance,
      // The sentence the UI shows under the headline, built here so no client
      // has to decide how to phrase "we have not measured anything".
      attendanceSentence: describeAttendance(attendance),
      assignments,
      /** Missed classes made up, which is the trend a parent actually acts on. */
      catchup,
      verdict: buildVerdict(attendance, assignments, child.name, catchup.open),
      /**
       * The exam this child is preparing for, or null. Only the date crosses the
       * wire: the client words it, so a page left open overnight self-corrects
       * without the polling this route deliberately avoids.
       */
      examCountdown,
      upcomingClasses: upcoming,
      /**
       * Recent classes for the home screen strip. The full list lives at
       * /api/parent/timetable; this is the last handful so the parent sees
       * something concrete without a second request.
       */
      recentClasses: attendanceWindow.views.slice(0, 5),
    });
  } catch (err) {
    return errorResponse(err, 'Could not load your child’s summary');
  }
}

/**
 * The one plain-language answer at the top of the screen.
 *
 * Deliberately conservative. An anxious parent reading "Needs attention" will
 * act on it, so the red band is reserved for a pattern (repeated absences, or
 * work genuinely piling up), never a single missed class.
 *
 * 'not_enough_data' is a first-class outcome, not a fallback. With no measured
 * attendance and no assignments there is nothing honest to say, and inventing
 * "On track" would be worse than admitting it.
 */
function buildVerdict(
  attendance: ReturnType<typeof summarise>,
  assignments: ReturnType<typeof summariseAssignments>,
  childName: string | null,
  catchupOpen = 0
): { band: VerdictBand; headline: string; detail: string } {
  const name = childName?.split(' ')[0] || 'Your child';
  const reasons: string[] = [];

  const hasAttendanceSignal = attendance.measuredClasses > 0;
  const hasAssignmentSignal = assignments.total > 0;

  if (!hasAttendanceSignal && !hasAssignmentSignal) {
    return {
      band: 'not_enough_data',
      headline: 'Not enough data yet',
      detail:
        "We haven't recorded any classes or assignments for this period yet. This page will fill in as the term goes on.",
    };
  }

  const missedRecently = attendance.missed - attendance.missedWithReason;
  if (missedRecently >= 2) {
    reasons.push(
      `missed ${missedRecently} of ${attendance.measuredClasses} recorded classes`
    );
  }
  if (assignments.overdue >= 1) {
    reasons.push(
      `${assignments.overdue} assignment${assignments.overdue === 1 ? ' is' : 's are'} overdue`
    );
  }
  if (attendance.droppedMidClass >= 2) {
    reasons.push(`left ${attendance.droppedMidClass} classes part way through`);
  }
  // A backlog of un-caught-up classes compounds: each one makes the next class
  // harder to follow, so it belongs in the verdict rather than only on its own
  // tile. Two, not one, so a single class missed last week is not an alarm.
  if (catchupOpen >= 2) {
    reasons.push(`has ${catchupOpen} classes still to catch up on`);
  }

  const serious = missedRecently >= 3 || assignments.overdue >= 3 || catchupOpen >= 4;

  if (reasons.length === 0) {
    return {
      band: 'on_track',
      headline: 'On track',
      detail: hasAttendanceSignal
        ? `${name} is attending and keeping up with the work.`
        : `${name} is keeping up with the work.`,
    };
  }

  const detail = `${name} ${reasons.join(', and ')}.`;

  return serious
    ? { band: 'needs_attention', headline: 'Needs your attention', detail }
    : { band: 'slipping', headline: 'Slipping', detail };
}
