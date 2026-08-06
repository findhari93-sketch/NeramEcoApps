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
// The clock
// ---------------------------------------------------------------------------
//
// One class at a time carries a deadline, and it starts when the student starts
// the class rather than on a date fixed by the timetable.
//
// The screen this replaces gave every missed class a deadline of "the day the
// next class ran", so a July backlog opened in August was four cards of red
// with no order to them. A student cannot act on four simultaneous failures.
// Here, nothing has a deadline until it is started, so there is always exactly
// one thing being asked of them.
//
// Days, not seconds. Every comparison in this feature is already YYYY-MM-DD, and
// a second unit would let the screen and the nudge cron round differently.

/** The two stopwatch columns, as they come back from the database. */
export interface CatchupClock {
  /** IST day the clock was last started. Null means it is not running. */
  activatedOn: string | null;
  /** Whole days already spent on this class in earlier stints. */
  daysUsed: number;
}

/** How long a student gets, once they start. */
export interface CatchupWindows {
  /** `late_joiner` and `no_show`. */
  standardDays: number;
  /** `opted_out`, a class they declined in advance. */
  optedOutDays: number;
}

export const DEFAULT_CATCHUP_WINDOWS: CatchupWindows = {
  standardDays: 7,
  optedOutDays: 3,
};

const NO_CLOCK: CatchupClock = { activatedOn: null, daysUsed: 0 };

/**
 * The window for one kind.
 *
 * A deliberate skip draws the shorter one. Handing someone who declined a class
 * the same week as a late joiner working through four months of syllabus they
 * never had the chance to attend reads as unfair to the late joiner, and `kind`
 * already records which is which.
 */
export function catchupWindowDays(
  kind: CatchupKind,
  windows: CatchupWindows = DEFAULT_CATCHUP_WINDOWS,
): number {
  const raw = kind === 'opted_out' ? windows.optedOutDays : windows.standardDays;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CATCHUP_WINDOWS.standardDays;
}

/** Whole days from one YYYY-MM-DD to another. Negative if `to` is earlier. */
export function diffDaysYmd(from: string, to: string): number {
  return Math.round((ymdEpoch(to) - ymdEpoch(from)) / DAY_MS);
}

export function isCatchupClockRunning(clock: CatchupClock | null | undefined): boolean {
  return !!clock?.activatedOn;
}

/** Banked days plus whatever the running stint has added so far. */
export function catchupDaysSpent(clock: CatchupClock | null | undefined, today: string): number {
  const c = clock ?? NO_CLOCK;
  const banked = Math.max(0, Math.round(Number(c.daysUsed) || 0));
  if (!c.activatedOn) return banked;
  return banked + Math.max(0, diffDaysYmd(c.activatedOn, today));
}

/**
 * What `days_used` should become when the clock is stopped today.
 *
 * This is the whole anti-exploit. Without banking, a student one day from their
 * deadline could start something else and come back to a fresh week, forever.
 * With it, stints add up: away on day 3 of 7 and back a week later leaves 4
 * days, and away-and-back within the same day banks nothing and recomputes the
 * identical deadline, so a double tap changes nothing.
 */
export function bankCatchupClock(clock: CatchupClock | null | undefined, today: string): number {
  return catchupDaysSpent(clock, today);
}

/**
 * The day this class must be finished by, or null when no clock is running.
 *
 * That null is the point of the redesign: an item nobody has started cannot be
 * late, so it renders with no colour and no date and asks nothing of anyone.
 *
 * Inclusive, matching `isOverdue`: a student has the whole of the due day.
 *
 * Deliberately not clamped at "today". A student who sat on a class for twelve
 * days of a seven day window gets a deadline in the past, which is true. Moving
 * it forward on every restart would hand out a free day per restart, which is
 * the exploit again at a slower rate.
 */
export function catchupDueOn(
  clock: CatchupClock | null | undefined,
  windowDays: number,
): string | null {
  const c = clock ?? NO_CLOCK;
  if (!c.activatedOn) return null;
  // An unparseable activation date is bad data, not a deadline. Returning null
  // means the row reads as "not started", which is the safe direction: a nudge
  // cron sweeping the whole school must not throw because one row is malformed.
  if (!Number.isFinite(ymdEpoch(c.activatedOn))) return null;
  const banked = Math.max(0, Math.round(Number(c.daysUsed) || 0));
  const remaining = Math.round(windowDays) - banked - 1;
  return addDaysYmd(c.activatedOn, remaining);
}

/** Days left on a running clock. Negative once past it. Null when stopped. */
export function catchupDaysLeft(
  clock: CatchupClock | null | undefined,
  windowDays: number,
  today: string,
): number | null {
  const dueOn = catchupDueOn(clock, windowDays);
  if (!dueOn) return null;
  return diffDaysYmd(today, dueOn);
}

/**
 * What to write to move the clock onto `targetIndex`.
 *
 * Pure, so the arithmetic stays under the type checker even though the query
 * layer that performs the writes carries `@ts-nocheck`.
 *
 * The caller must apply the deactivation FIRST. Supabase gives no transaction
 * across two statements, and a failure between them should leave the student
 * with no clock running (recoverable, they press Start again) rather than two,
 * which the partial unique index would reject with a 500 mid-flow.
 */
export function planCatchupActivation(
  items: CatchupItemFacts[],
  targetIndex: number,
  today: string,
): {
  /** Index of the item to stop, or null if nothing is running. */
  deactivateIndex: number | null;
  /** The `days_used` to write on it. */
  deactivateDaysUsed: number;
  /** The `activated_on` to write on the target, or null if already running. */
  activateOn: string | null;
} {
  const target = items[targetIndex];
  const activeIndex = items.findIndex((f) => isCatchupClockRunning(f.clock));

  // Already the running one. A second press must not restart the window.
  if (activeIndex === targetIndex) {
    return { deactivateIndex: null, deactivateDaysUsed: 0, activateOn: null };
  }

  return {
    deactivateIndex: activeIndex >= 0 ? activeIndex : null,
    deactivateDaysUsed: activeIndex >= 0 ? bankCatchupClock(items[activeIndex].clock, today) : 0,
    activateOn: target ? today : null,
  };
}

// ---------------------------------------------------------------------------
// What a student must do next for one class
// ---------------------------------------------------------------------------

/** How a class came to be owed. Decides the window and the suggested order. */
export type CatchupKind = 'late_joiner' | 'no_show' | 'opted_out';

export interface CatchupItemFacts {
  /**
   * Which of the three debts this is.
   *
   * `late_joiner` is syllabus taught before the student enrolled. The other two
   * are classes they were on the roster for: `no_show` simply missed,
   * `opted_out` declined in advance.
   *
   * Defaults to `late_joiner` so a caller that has not been updated keeps the
   * old meaning of `chained`.
   */
  kind?: CatchupKind;
  /**
   * Does this item wait its turn?
   *
   * Derived from `kind` when omitted. It no longer LOCKS anything: a student may
   * start any class out of turn, and this only splits the pace denominator and
   * the two lists on the student screen.
   *
   * The hard chain it used to describe is gone. Locking a late joiner out of
   * class 14 until they had done 1 through 13 meant one unprepared recap in the
   * middle stalled the entire backlog, and it took the choice of where to start
   * away from the person best placed to make it.
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
  /**
   * Must it be passed to finish this class?
   *
   * Defaults to true when omitted, which keeps every existing caller's meaning:
   * the auto-generated catch-up paper has always been compulsory.
   *
   * False only for a teacher-set class test marked Optional. Such a test is still
   * offered and still shown, it simply never blocks "caught up". A student who
   * missed a class must not be held on a backlog by a paper their own classmates
   * were told they could skip.
   */
  testRequired?: boolean;
  /** The stopwatch. Absent means never started. */
  clock?: CatchupClock;
}

/** True for the two kinds that mean "you were on the roster and were not there". */
export function isMissedLiveClass(kind: CatchupKind): boolean {
  return kind === 'no_show' || kind === 'opted_out';
}

function kindOf(f: CatchupItemFacts): CatchupKind {
  if (f.kind) return f.kind;
  // A caller still speaking the old vocabulary: chained meant the late joiner's
  // backlog, and everything else was a class they were enrolled for.
  return f.chained === false ? 'no_show' : 'late_joiner';
}

/** The one thing standing between the student and finishing this class. */
export type CatchupStep = 'watch' | 'assignment' | 'test' | 'done';

/** Does this item's test stand between the student and finishing? */
function testBlocks(f: CatchupItemFacts): boolean {
  return f.hasTest && f.testRequired !== false && !f.testPassed;
}

/**
 * Is every gate on this class cleared?
 *
 * `notReady` is deliberately NOT a gate, and used to be. It means "there is a
 * recording but the guided recap is not published", which is precisely the state
 * in which the screen offers "I have watched it" and `isWatched` accepts it. So
 * a student could clear every step they were shown, see three green ticks, press
 * the button and be refused with the one message that names no cause. An
 * unpublished recap is the teacher's outstanding work, not the student's, and
 * `pending_teacher` is documented everywhere else as blocking nothing.
 *
 * `excluded` still blocks, because there it is true: no recording exists, so
 * there is genuinely nothing for the student to have watched.
 */
export function isCatchupItemComplete(f: CatchupItemFacts): boolean {
  if (f.excluded) return false;
  if (f.excused) return true;
  if (!f.watched) return false;
  if (f.assignmentsOutstanding > 0) return false;
  if (testBlocks(f)) return false;
  return true;
}

/**
 * The next step, in the order the gates are enforced: watch it, do the work,
 * then prove it. A class with no test placed on it finishes at the assignment,
 * so a teacher who has not built the test yet does not strand anyone. An
 * OPTIONAL test behaves the same way: it is offered on the screen, but it is not
 * what the student is waiting on.
 */
export function catchupItemStep(f: CatchupItemFacts): CatchupStep {
  if (isCatchupItemComplete(f)) return 'done';
  if (!f.watched) return 'watch';
  if (f.assignmentsOutstanding > 0) return 'assignment';
  if (testBlocks(f)) return 'test';
  return 'done';
}

// ---------------------------------------------------------------------------
// Resolving the whole backlog
// ---------------------------------------------------------------------------

export type CatchupItemStatus =
  | 'done'
  /** The clock is running on this one. At most one per (student, classroom). */
  | 'active'
  /** Startable whenever the student chooses. No clock, no deadline, no red. */
  | 'waiting'
  | 'excused'
  /** No recording. Shown greyed out, blocks nothing, counts for nothing. */
  | 'blocked'
  /** Recording is there, recap is not published yet. Blocks nothing. */
  | 'pending_teacher';

export interface ResolvedCatchupItem {
  status: CatchupItemStatus;
  step: CatchupStep;
  kind: CatchupKind;
  /** Late joiner backlog. Splits the pace denominator; no longer locks anything. */
  chained: boolean;
  /** 1-based position among items that count toward pace, else null. */
  position: number | null;
  /** Counts toward the pace numerator and denominator. */
  countsTowardPace: boolean;
  /** The clock is on this one. */
  active: boolean;
  /** 1-based suggested order among startable items. Null when not startable. */
  order: number | null;
  /** `order === 1`. Exactly one item carries it: what the hero card points at. */
  recommended: boolean;
  /** Only ever non-null on the active item. */
  dueOn: string | null;
  daysLeft: number | null;
  overdue: boolean;
  /** Echoed so the screen can say "you get N days" BEFORE they commit. */
  windowDays: number;
}

export interface ResolveCatchupContext {
  /** IST today. Passed in, never read from the clock, so a cohort is judged once. */
  today: string;
  windows: CatchupWindows;
}

/**
 * Decide what each item is, what is recommended, and what is actually due.
 *
 * Two things changed here and both are deliberate.
 *
 * There is no chain any more. A late joiner used to be locked out of class 14
 * until they had cleared 1 through 13, which meant one unprepared recap in the
 * middle stalled the whole backlog, and it took the choice of where to start
 * away from the person best placed to make it. Order survives as a
 * recommendation: `recommended` marks one item, and nothing refuses the others.
 *
 * And only the active item has a deadline. Everything else returns
 * `dueOn: null, overdue: false`, which is what turns four simultaneous red
 * cards into one thing being asked.
 *
 * A class they were on the roster for outranks the whole late joiner backlog,
 * because it is the one the course is building on right now.
 *
 * @param items ordered oldest first, by (scheduled_date, start_time, id)
 */
export function resolveCatchupBacklog(
  items: CatchupItemFacts[],
  ctx: ResolveCatchupContext,
): ResolvedCatchupItem[] {
  const { today, windows } = ctx;
  let position = 0;

  // Pass 1: classify, and note which items a student could start.
  const resolved: ResolvedCatchupItem[] = items.map((f) => {
    const kind = kindOf(f);
    const chained = f.chained !== undefined ? f.chained !== false : kind === 'late_joiner';
    const step = catchupItemStep(f);
    const windowDays = catchupWindowDays(kind, windows);
    const base = {
      step,
      kind,
      chained,
      position: null as number | null,
      countsTowardPace: false,
      active: false,
      order: null as number | null,
      recommended: false,
      dueOn: null as string | null,
      daysLeft: null as number | null,
      overdue: false,
      windowDays,
    };

    if (f.excluded) return { ...base, status: 'blocked' as const };
    if (f.excused) return { ...base, status: 'excused' as const, step: 'done' as const };
    // Waiting on the teacher is a state for work the student still owes. Once
    // they have finished the class off the raw recording, saying they are
    // waiting on us would tell them it is unfinished, keep it out of their
    // progress bar, and hold the journey open behind a class that is done.
    if (f.notReady && !isCatchupItemComplete(f)) {
      return { ...base, status: 'pending_teacher' as const };
    }

    // Position and pace are the late joiner's quota, untouched by this change.
    if (chained) {
      position += 1;
      base.position = position;
      base.countsTowardPace = true;
    }

    if (isCatchupItemComplete(f)) return { ...base, status: 'done' as const };
    return { ...base, status: 'waiting' as const };
  });

  // Pass 2: exactly one clock.
  //
  // The partial unique index makes two running clocks impossible in the
  // database, but the write path is two statements, so a failure between them
  // could momentarily leave two. Keeping the earliest and demoting the rest is
  // deterministic, which matters more than being clever: a partial write must
  // still render a coherent screen.
  const startable = resolved
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.status === 'waiting');

  const running = startable
    .filter(({ i }) => isCatchupClockRunning(items[i].clock))
    .sort((a, b) => {
      const av = items[a.i].clock?.activatedOn ?? '';
      const bv = items[b.i].clock?.activatedOn ?? '';
      return av === bv ? a.i - b.i : av < bv ? -1 : 1;
    });

  const activeIdx = running.length ? running[0].i : -1;
  if (activeIdx >= 0) {
    const r = resolved[activeIdx];
    const clock = items[activeIdx].clock;
    r.status = 'active';
    r.active = true;
    r.dueOn = catchupDueOn(clock, r.windowDays);
    r.daysLeft = catchupDaysLeft(clock, r.windowDays, today);
    r.overdue = isOverdue(r.dueOn, today);
  }

  // Pass 3: the suggested order.
  //
  // Active first, because telling a student to do something else while their
  // clock runs on this one contradicts itself. Then a missed live class ahead of
  // the late joiner backlog. Then oldest, which the input array already is.
  const ranked = [...startable].sort((a, b) => {
    const aActive = a.i === activeIdx ? 0 : 1;
    const bActive = b.i === activeIdx ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aKind = isMissedLiveClass(resolved[a.i].kind) ? 0 : 1;
    const bKind = isMissedLiveClass(resolved[b.i].kind) ? 0 : 1;
    if (aKind !== bKind) return aKind - bKind;
    return a.i - b.i;
  });

  ranked.forEach(({ i }, n) => {
    resolved[i].order = n + 1;
    resolved[i].recommended = n === 0;
  });

  return resolved;
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
 *
 * @deprecated Superseded by the per-student clock. See `catchupDueOn`.
 */
export const MISSED_CLASS_FALLBACK_DAYS = 7;

/**
 * The day a missed class must be cleared by: the day the next class runs.
 *
 * @deprecated Superseded by `catchupDueOn`, and this is why.
 *
 * Anchoring the deadline to the timetable was right about one thing (the
 * student needs to follow the class being taught now) and catastrophically
 * wrong about another: every class more than a week old is overdue the instant
 * it appears. A student opening their July backlog in August met four red cards
 * at once, all "Was due", with no order and nothing actionable. A deadline that
 * has already passed for every item is not a deadline, it is a wall.
 *
 * Kept for one release because it answers a genuinely separate question, "when
 * did the course move past this class", which a teacher view may still want.
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

/**
 * Counts for the missed-class half of the student screen.
 *
 * `overdue` is now 0 or 1, never a magnitude: only the item with the clock on it
 * can be late. That is the intended consequence of one clock at a time, but it
 * does mean this is no longer the teacher's chase signal. Use
 * `summariseCatchupClock().stalled` for that.
 */
export function summariseMissedClasses(resolved: ResolvedCatchupItem[]): {
  total: number;
  completed: number;
  open: number;
  overdue: number;
  /** Open, and nothing running on them. */
  waiting: number;
} {
  let total = 0;
  let completed = 0;
  let open = 0;
  let overdue = 0;
  let waiting = 0;

  resolved.forEach((r) => {
    if (r.chained) return;
    // Excused, and classes with nothing to watch, are not work anyone owes.
    if (r.status === 'excused' || r.status === 'blocked' || r.status === 'pending_teacher') return;

    total += 1;
    if (r.status === 'done') {
      completed += 1;
      return;
    }
    open += 1;
    if (r.active) {
      if (r.overdue) overdue += 1;
    } else {
      waiting += 1;
    }
  });

  return { total, completed, open, overdue, waiting };
}

/**
 * The clock view of a whole backlog, chained and unchained together.
 *
 * This is what a teacher needs now that "how many are overdue" can only ever be
 * one. `stalled` is the replacement chase signal: real work owed and no clock
 * running on any of it, which is the student who opened the app, saw the list
 * and closed it again.
 */
export function summariseCatchupClock(resolved: ResolvedCatchupItem[]): {
  active: boolean;
  waiting: number;
  overdue: boolean;
  /** Days left on the active item. Negative once past it. */
  daysLeft: number | null;
  stalled: boolean;
} {
  const activeItem = resolved.find((r) => r.active) ?? null;
  const waiting = resolved.filter((r) => r.status === 'waiting').length;
  return {
    active: !!activeItem,
    waiting,
    overdue: !!activeItem?.overdue,
    daysLeft: activeItem?.daysLeft ?? null,
    stalled: !activeItem && waiting > 0,
  };
}
