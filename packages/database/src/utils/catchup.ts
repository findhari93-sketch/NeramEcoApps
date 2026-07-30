/**
 * Catch-up journey rules, as pure functions.
 *
 * Two audiences read these: the API that decides what a student is allowed to
 * do next, and the UI that draws it. Keeping the rule in one function is what
 * stops a screen from offering a button the server will refuse.
 *
 * Deliberately free of Supabase, React and dates-from-the-clock, so they can be
 * unit tested without a database and run on either side of the wire. The query
 * layer that calls them carries `@ts-nocheck` until types are regenerated, so
 * every decision worth getting right lives here instead, under the type checker.
 */

// ---------------------------------------------------------------------------
// Which past classes belong in a backlog at all
// ---------------------------------------------------------------------------

export interface CatchupCandidateClass {
  status: string | null;
  recording_url: string | null;
  youtube_url: string | null;
}

export interface CatchupCandidateRecap {
  id: string;
  status: string;
}

export type CatchupCandidateVerdict =
  /** A published gated recap exists. The student can start immediately. */
  | 'eligible'
  /** A recording exists but no published recap yet. Show it, do not block on it. */
  | 'not_ready'
  /** Nothing to watch, ever. Listed for the teacher as "cannot be caught up". */
  | 'no_recording'
  /** Never happened. Not an item at all. */
  | 'skip';

/**
 * Decide what a past class is worth to a student who missed it.
 *
 * `not_ready` is the interesting case and the reason this is not a boolean. A
 * class with a raw recording but no published recap cannot be excluded: the
 * teacher may publish the recap tomorrow, and a permanent exclusion would
 * silently shrink the syllabus with nobody noticing.
 */
export function classifyCatchupCandidate(
  cls: CatchupCandidateClass,
  recap: CatchupCandidateRecap | null,
): CatchupCandidateVerdict {
  // Nobody missed a class that did not run.
  if (cls.status === 'cancelled') return 'skip';
  if (recap && recap.status === 'published') return 'eligible';
  if (cls.recording_url || cls.youtube_url) return 'not_ready';
  return 'no_recording';
}

// ---------------------------------------------------------------------------
// What a student must do next for one class
// ---------------------------------------------------------------------------

export interface CatchupItemFacts {
  /**
   * Does this item wait its turn?
   *
   * Defaults to true, which is the late joiner's backlog: months of syllabus
   * worked through in the order it was taught, one class open at a time.
   *
   * A class the student was enrolled for and simply missed passes `false`. There
   * is no order to keep between two scattered Tuesdays, and chaining them would
   * be actively wrong for a late joiner who then misses a live class: that class
   * would sit locked behind their entire backlog, which is the opposite of
   * urgent.
   */
  chained?: boolean;
  /** No recording exists, so this class can never be completed. */
  excluded?: boolean;
  /** A teacher waived it. */
  excused?: boolean;
  /** Recording exists but the gated recap is not published yet. */
  notReady?: boolean;
  /**
   * The gated recap is complete, or (for a legacy absence with only a raw link)
   * the student declared they watched it. Derived by the caller from both.
   */
  watched: boolean;
  /** Published assignments on this class with no submission from this student. */
  assignmentsOutstanding: number;
  /** A class test is placed on this class. */
  hasTest: boolean;
  testPassed: boolean;
}

/** The one thing standing between the student and finishing this class. */
export type CatchupStep = 'watch' | 'assignment' | 'test' | 'done';

/** Is every gate on this class cleared? */
export function isCatchupItemComplete(f: CatchupItemFacts): boolean {
  if (f.excluded || f.notReady) return false;
  if (f.excused) return true;
  if (!f.watched) return false;
  if (f.assignmentsOutstanding > 0) return false;
  if (f.hasTest && !f.testPassed) return false;
  return true;
}

/**
 * The next step, in the order the gates are enforced: watch it, do the work,
 * then prove it. A class with no test placed on it finishes at the assignment,
 * so a teacher who has not built the test yet does not strand anyone.
 */
export function catchupItemStep(f: CatchupItemFacts): CatchupStep {
  if (isCatchupItemComplete(f)) return 'done';
  if (!f.watched) return 'watch';
  if (f.assignmentsOutstanding > 0) return 'assignment';
  if (f.hasTest && !f.testPassed) return 'test';
  return 'done';
}

// ---------------------------------------------------------------------------
// Chronological unlock across the whole backlog
// ---------------------------------------------------------------------------

export type CatchupItemStatus =
  | 'done'
  /** The one open item in a CHAINED backlog. Exactly zero or one item has this. */
  | 'current'
  | 'locked'
  /** An unchained item with work left. Always startable, never waits its turn. */
  | 'open'
  | 'excused'
  /** No recording. Shown greyed out, blocks nothing, counts for nothing. */
  | 'blocked'
  /** Recording is there, recap is not published yet. Blocks nothing. */
  | 'pending_teacher';

export interface ResolvedCatchupItem {
  status: CatchupItemStatus;
  step: CatchupStep;
  /** Echoes the input, so the summaries can tell the two audiences apart. */
  chained: boolean;
  /** 1-based position among items that count toward pace, else null. */
  position: number | null;
  /** Counts toward the pace numerator and denominator. */
  countsTowardPace: boolean;
}

/**
 * Walk a chronologically ordered backlog and decide what is open.
 *
 * Only real, doable work gates the chain. A class the teacher has not prepared
 * (`notReady`) and a class that can never be caught up (`excluded`) are both
 * stepped over rather than stalling every later class behind them, and neither
 * counts toward pace: a student must never be marked behind for work that was
 * not available to them.
 *
 * @param items ordered oldest first, by (scheduled_date, start_time, id)
 */
export function resolveCatchupBacklog(items: CatchupItemFacts[]): ResolvedCatchupItem[] {
  let position = 0;
  let currentTaken = false;

  return items.map((f) => {
    const step = catchupItemStep(f);
    const chained = f.chained !== false;
    const off = { chained, position: null, countsTowardPace: false };

    if (f.excluded) {
      return { ...off, status: 'blocked' as const, step };
    }
    if (f.excused) {
      return { ...off, status: 'excused' as const, step: 'done' as const };
    }
    if (f.notReady) {
      return { ...off, status: 'pending_teacher' as const, step };
    }

    // An unchained item never takes a turn, never holds anyone else up, and
    // never enters the weekly quota: its deadline comes from the timetable
    // instead, which is a different clock entirely.
    if (!chained) {
      return { ...off, status: isCatchupItemComplete(f) ? ('done' as const) : ('open' as const), step };
    }

    position += 1;
    const base = { chained, position, countsTowardPace: true };

    if (isCatchupItemComplete(f)) {
      return { ...base, status: 'done' as const, step };
    }
    if (!currentTaken) {
      currentTaken = true;
      return { ...base, status: 'current' as const, step };
    }
    return { ...base, status: 'locked' as const, step };
  });
}

/**
 * Totals for the progress bar and the pace calculation.
 *
 * The CHAINED backlog only, every field of it. The weekly quota is a promise
 * about the classes taught before a student joined, so a class they later missed
 * must not move the target, and must not hold their journey open either: the
 * pacing cron closes a journey on `pendingTeacher === 0`, and an unchained item
 * waiting on its recap has nothing to do with whether that backlog is finished.
 */
export function summariseCatchupBacklog(resolved: ResolvedCatchupItem[]): {
  total: number;
  completed: number;
  blocked: number;
  pendingTeacher: number;
} {
  const chained = resolved.filter((r) => r.chained);
  return {
    total: chained.filter((r) => r.countsTowardPace).length,
    completed: chained.filter((r) => r.countsTowardPace && r.status === 'done').length,
    blocked: chained.filter((r) => r.status === 'blocked').length,
    pendingTeacher: chained.filter((r) => r.status === 'pending_teacher').length,
  };
}

// ---------------------------------------------------------------------------
// A class you were here for and missed
// ---------------------------------------------------------------------------
//
// Different clock from the backlog above. A late joiner owes months of syllabus
// and gets a weekly quota; someone who missed last Tuesday owes one class and
// needs it before the course moves past them.
//
// The date helpers below take "today" as an argument rather than reading the
// clock, so this module stays pure and a whole cohort can be judged against one
// consistent day.

const DAY_MS = 86_400_000;

function ymdEpoch(ymd: string): number {
  return Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
}

/** Add whole days to a YYYY-MM-DD, staying in YYYY-MM-DD. */
export function addDaysYmd(ymd: string, days: number): string {
  return new Date(ymdEpoch(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Fallback window when the timetable has nothing scheduled after the class the
 * student missed, which happens at the end of a term and during a break.
 */
export const MISSED_CLASS_FALLBACK_DAYS = 7;

/**
 * The day a missed class must be cleared by: the day the next class runs.
 *
 * Not a fixed seven days. A fixed window drifts out of step with the timetable,
 * and the thing being protected is the student's ability to follow the class
 * actually being taught, so the timetable is what should set the deadline.
 *
 * Derived on every read rather than stored, so a rescheduled class carries its
 * deadline with it and a quota change never has to rewrite N rows.
 */
export function missedClassDueOn(classDate: string, nextClassDate: string | null): string {
  const missed = classDate.slice(0, 10);
  if (!nextClassDate) return addDaysYmd(missed, MISSED_CLASS_FALLBACK_DAYS);

  const next = nextClassDate.slice(0, 10);
  // A "next" class that is not actually later is bad data, not a deadline of
  // yesterday. Fall back rather than marking someone instantly overdue.
  return next > missed ? next : addDaysYmd(missed, MISSED_CLASS_FALLBACK_DAYS);
}

/**
 * Past the deadline, and only past it.
 *
 * The day itself is not overdue: classes run in the evening, so a student has
 * the whole of the due day to clear it.
 */
export function isOverdue(dueOn: string | null, today: string): boolean {
  if (!dueOn) return false;
  return today.slice(0, 10) > dueOn.slice(0, 10);
}

/** Counts for the missed-class half of the screen, and for the chase list. */
export function summariseMissedClasses(
  resolved: ResolvedCatchupItem[],
  overdueFlags: boolean[],
): { total: number; completed: number; open: number; overdue: number } {
  let total = 0;
  let completed = 0;
  let open = 0;
  let overdue = 0;

  resolved.forEach((r, i) => {
    if (r.chained) return;
    // Excused, and classes with nothing to watch, are not work anyone owes.
    if (r.status === 'excused' || r.status === 'blocked' || r.status === 'pending_teacher') return;

    total += 1;
    if (r.status === 'done') {
      completed += 1;
      return;
    }
    open += 1;
    if (overdueFlags[i]) overdue += 1;
  });

  return { total, completed, open, overdue };
}
