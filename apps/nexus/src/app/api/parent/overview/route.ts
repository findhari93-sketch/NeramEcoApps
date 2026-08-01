import { NextRequest, NextResponse } from 'next/server';
import { listAssignmentsForStudent, getAssignmentEngagement } from '@neram/database';
import { getParentUser, resolveChildContext } from '@/lib/parent-auth';
import { errorResponse } from '@/lib/api-errors';
import { summarise, describeAttendance } from '@/lib/parent-attendance';
import { buildParentAssignmentViews, summariseAssignments } from '@/lib/parent-assignments';
import { loadChildAttendance, loadUpcomingClasses, istDaysAgo, istToday } from '@/lib/parent-data';
import { loadEnrollmentContext } from '@/lib/parent-enrollment';
import { loadChildCatchup } from '@/lib/parent-catchup';
import { loadParentTests } from '@/lib/parent-tests';
import { resolveExamCountdown } from '@/lib/exam-countdown-server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  buildClassStandingSignals,
  loadExcusedClassIds,
} from '@/lib/class-standing-signals';
import { computeClassStanding, toLegacyVerdictBand } from '@/lib/class-standing';
import { FEATURE_FLAGS_KEY, resolveFlags, type FlagMap } from '@/lib/feature-flags';
import { getNexusSetting } from '@neram/database';

/** The flag that decides whether a parent sees the number at all. */
const PARENT_STANDING_FEATURE = 'parent.class-standing';

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

    // Class Standing. Second wave, because every one of these needs the class
    // ids the attendance window just produced.
    //
    // getAssignmentEngagement is called here even though this route already has
    // assignment views, because the STAFF profile scores from that function. Two
    // derivations of "how much work has this child handed in" would eventually
    // disagree, and a parent being told something different from the teacher is
    // worse than the four extra queries this costs.
    const classIds = attendanceWindow.classes.map((c: { id: string }) => c.id);
    const classMeta = new Map<string, { title: string; date: string }>(
      attendanceWindow.classes.map((c: any) => [c.id, { title: c.title, date: c.scheduled_date }])
    );

    const [tests, excusedClassIds, engagement, flagRow] = await Promise.all([
      loadParentTests(child.id, classIds, classMeta),
      loadExcusedClassIds(child.id, classIds),
      getAssignmentEngagement(classroomId).catch(() => null),
      getNexusSetting(FEATURE_FLAGS_KEY).catch(() => null),
    ]);

    // Gated server side, not in the client. With the flag off the standing is
    // absent from the payload entirely, so there is nothing for a parent to find
    // in devtools before we have decided to show it to them.
    const standingEnabled =
      resolveFlags((flagRow?.value as FlagMap) || {})[PARENT_STANDING_FEATURE] === true;

    const classStanding = computeClassStanding(
      buildClassStandingSignals({
        enrolledAt: enrollment?.enrolled_at ?? null,
        today: istToday(),
        windowDays: days,
        views: attendanceWindow.views,
        summary: attendance,
        excusedClassIds,
        engagement: engagement?.rows.find((r) => r.student.id === child.id) ?? null,
        tests,
        catchup,
      }),
      // Same number, same band, supportive wording.
      'parent'
    );

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
      /**
       * The one number, identical to what staff see on the student profile
       * because both come from computeClassStanding over the same signals.
       * null while parent.class-standing is switched off.
       */
      classStanding: standingEnabled ? classStanding : null,
      /**
       * DEPRECATED, kept for one release so the existing chip on the parent
       * dashboard keeps working while it is swapped for the standing card.
       * Delete once nothing reads `verdict`.
       */
      verdict: {
        band: toLegacyVerdictBand(classStanding.band),
        headline: classStanding.headline,
        detail: classStanding.detail,
      },
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

/*
 * buildVerdict lived here. It was a second, independent judgement about the same
 * child, computed from a different subset of the same data as the staff-facing
 * one, so a parent and a teacher could look at one student and be told two
 * different things. It has been subsumed by computeClassStanding
 * (lib/class-standing.ts), which both surfaces now call with signals built by
 * the same pure builder. The `verdict` key above is a thin adapter over the new
 * band, kept for one release.
 */
