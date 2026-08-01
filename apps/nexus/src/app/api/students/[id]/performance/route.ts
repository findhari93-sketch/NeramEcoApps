import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient, getAssignmentEngagement } from '@neram/database';
import { loadChildAttendance, istDaysAgo } from '@/lib/parent-data';
import { summarise, describeAttendance } from '@/lib/parent-attendance';
import { loadParentTests, summariseTests } from '@/lib/parent-tests';
import { loadChildCatchup } from '@/lib/parent-catchup';
import { istToday } from '@/lib/parent-data';
import {
  buildClassStandingSignals,
  loadExcusedClassIds,
} from '@/lib/class-standing-signals';
import { computeClassStanding } from '@/lib/class-standing';
import type {
  ProfilePrepState,
  StudentPerformancePayload,
} from '@/lib/student-profile-types';

/** Rolling window for attendance and punctuality. See the plan for why 90. */
const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 730;

/**
 * GET /api/students/[id]/performance?classroom={id}&days=90
 *
 * How a student is actually doing: attendance, assignments, tests, catch-up and
 * class-prep readiness. Split from the core bundle because these are the
 * expensive reads and a slow attendance query must not delay a teacher seeing a
 * phone number.
 *
 * ---------------------------------------------------------------------------
 * ATTENDANCE IS LOADED THROUGH loadChildAttendance, AND THAT IS NOT OPTIONAL.
 *
 * The obvious implementation, which this route replaces, counted
 * nexus_attendance rows filtered on student_id alone and divided by one
 * classroom's completed-class count. That is wrong twice over:
 *
 *   1. A student enrolled in two classrooms counted attendance from BOTH over
 *      one classroom's denominator, and could score above 100%.
 *   2. Attendance sync runs on a delegated Microsoft token and fails wholesale,
 *      so a class nobody synced has no rows at all and is indistinguishable
 *      from "the entire roster was absent". The old arithmetic reported 0%.
 *
 * loadChildAttendance scopes to the classroom AND the batch, and intersects
 * against the classes that have attendance rows for ANY student, so summarise()
 * returns attendanceRate: null for an unmeasured period. Null means "we did not
 * measure this", never "they did not attend". Callers must render
 * `sentence` rather than a percentage when the rate is null.
 * ---------------------------------------------------------------------------
 *
 * Gated on coord.student.view only. Teachers see all of this: it is teaching
 * data with no money in it. Fees live in ./finance.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'coord.student.view');

    const { id: studentId } = await params;
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const requestedDays = Number(request.nextUrl.searchParams.get('days'));
    const windowDays =
      Number.isFinite(requestedDays) && requestedDays > 0
        ? Math.min(requestedDays, MAX_WINDOW_DAYS)
        : DEFAULT_WINDOW_DAYS;

    const supabase = getSupabaseAdminClient();

    // The enrolment supplies batch_id, which scopes which classes this student
    // was ever expected to attend. Without it a student in a section would be
    // judged against the whole classroom's timetable.
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('batch_id, enrolled_at')
      .eq('classroom_id', classroomId)
      .eq('user_id', studentId)
      .eq('role', 'student')
      .maybeSingle();

    if (!enrollment) {
      return NextResponse.json(
        { error: 'Student not enrolled in this classroom' },
        { status: 404 },
      );
    }

    const scope = { batchId: (enrollment as any).batch_id ?? null };

    const [attendanceWindow, engagement, catchup, classroomRow] = await Promise.all([
      loadChildAttendance(studentId, classroomId, istDaysAgo(windowDays), scope),
      // Computes the whole roster and we keep one row. That is a CONSTANT four
      // queries, not an N+1, and the alternative is a second implementation of
      // the personal-clock rollup in packages/database/src/utils/assignment-clock.ts
      // which would drift from the assignments dashboard and the watchlist.
      // Correctness over payload size.
      getAssignmentEngagement(classroomId),
      // Read-only by design. Never call getCatchupBacklog from a GET: it UPDATEs
      // caught_up_at while reading. See lib/parent-catchup.ts.
      loadChildCatchup(studentId, classroomId),
      supabase.from('nexus_classrooms').select('name').eq('id', classroomId).maybeSingle(),
    ]);

    const summary = summarise(attendanceWindow.views);
    const classIds = attendanceWindow.classes.map((c: any) => c.id);

    const classMeta = new Map<string, { title: string; date: string }>(
      attendanceWindow.classes.map((c: any) => [
        c.id,
        { title: c.title, date: c.scheduled_date },
      ]),
    );

    const [tests, prep, excusedClassIds] = await Promise.all([
      loadParentTests(studentId, classIds, classMeta),
      loadPrepState(studentId, classIds),
      loadExcusedClassIds(studentId, classIds),
    ]);

    const engagementRow = engagement.rows.find((r) => r.student.id === studentId) ?? null;

    // Built from the data already fetched above, through the SAME pure builder
    // the parent overview uses. A parent and a teacher must never see two
    // different numbers for the same child.
    const classStanding = computeClassStanding(
      buildClassStandingSignals({
        enrolledAt: (enrollment as any).enrolled_at ?? null,
        today: istToday(),
        windowDays,
        views: attendanceWindow.views,
        summary,
        excusedClassIds,
        engagement: engagementRow,
        tests,
        catchup,
      }),
      'staff',
    );

    const payload: StudentPerformancePayload = {
      windowDays,
      classroomName: (classroomRow.data as any)?.name ?? null,
      attendance: {
        summary,
        // The single source of the unmeasured wording, so no component has to
        // decide how to phrase it and "0 of 0" can never reach a screen.
        sentence: describeAttendance(summary),
        views: attendanceWindow.views,
      },
      assignments: engagementRow,
      tests: { summary: summariseTests(tests), items: tests },
      catchup,
      prep,
      classStanding,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error('Student performance error:', err);
    return errorResponse(err, 'Failed to load student performance');
  }
}

/**
 * Class-prep readiness across the window.
 *
 * nexus_class_prep_state splits DERIVED columns (a rebuildable cache, only
 * recomputeClassPrep writes them) from OBSERVED ones (blocked_attempts and the
 * reason fields, which are the system of record). Both are read here; neither
 * is written, because a GET must not recompute.
 */
async function loadPrepState(
  studentId: string,
  classIds: string[],
): Promise<ProfilePrepState | null> {
  if (!classIds.length) return null;

  const supabase = getSupabaseAdminClient();

  // nexus_class_prep_state is absent from database.generated.ts. Documented
  // `as any` pattern, same as lib/parent-tests.ts and lib/parent-data.ts.
  const { data } = await (supabase.from('nexus_class_prep_state' as any) as any)
    .select('test_best_pct, test_attempts, blocked_attempts, unlocked_at, unlocked_via')
    .eq('student_id', studentId)
    .in('scheduled_class_id', classIds);

  const rows = (data || []) as Array<{
    test_best_pct: number | null;
    test_attempts: number | null;
    blocked_attempts: number | null;
    unlocked_at: string | null;
    unlocked_via: string | null;
  }>;

  if (!rows.length) return null;

  const scored = rows
    .map((r) => r.test_best_pct)
    .filter((p): p is number => typeof p === 'number');

  return {
    classesWithPrep: rows.length,
    ready: rows.filter((r) => r.unlocked_at !== null).length,
    blockedAttempts: rows.reduce((sum, r) => sum + (r.blocked_attempts || 0), 0),
    unlockedViaReason: rows.filter((r) => r.unlocked_via === 'reason').length,
    // An average of no scores is not zero, so it stays null.
    averageBestPct: scored.length
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : null,
  };
}
