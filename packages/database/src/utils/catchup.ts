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
  /** The one open item. Exactly zero or one item in a backlog has this. */
  | 'current'
  | 'locked'
  | 'excused'
  /** No recording. Shown greyed out, blocks nothing, counts for nothing. */
  | 'blocked'
  /** Recording is there, recap is not published yet. Blocks nothing. */
  | 'pending_teacher';

export interface ResolvedCatchupItem {
  status: CatchupItemStatus;
  step: CatchupStep;
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

    if (f.excluded) {
      return { status: 'blocked' as const, step, position: null, countsTowardPace: false };
    }
    if (f.excused) {
      return { status: 'excused' as const, step: 'done' as const, position: null, countsTowardPace: false };
    }
    if (f.notReady) {
      return { status: 'pending_teacher' as const, step, position: null, countsTowardPace: false };
    }

    position += 1;
    const base = { position, countsTowardPace: true };

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

/** Totals for the progress bar and the pace calculation. */
export function summariseCatchupBacklog(resolved: ResolvedCatchupItem[]): {
  total: number;
  completed: number;
  blocked: number;
  pendingTeacher: number;
} {
  return {
    total: resolved.filter((r) => r.countsTowardPace).length,
    completed: resolved.filter((r) => r.countsTowardPace && r.status === 'done').length,
    blocked: resolved.filter((r) => r.status === 'blocked').length,
    pendingTeacher: resolved.filter((r) => r.status === 'pending_teacher').length,
  };
}
