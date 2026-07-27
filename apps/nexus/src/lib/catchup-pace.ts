/**
 * Pacing for a catch-up backlog.
 *
 * A student who joins in month four owes seventeen classes. Handing them
 * seventeen at once is how a backlog becomes something you avoid opening. So the
 * work is paced: a quota per week, measured from the day they joined.
 *
 * Two deliberate choices, both about fairness rather than about arithmetic:
 *
 *   Falling behind never locks anything. The state only drives colour, a nudge,
 *   and the teacher's list. A student having a hard fortnight should be offered
 *   help, not a closed door.
 *
 *   Only work the student could actually have done counts. Classes with no
 *   recording, classes whose recap the teacher has not published, and classes a
 *   teacher excused are all out of the denominator. Nobody is marked behind for
 *   work that was never available.
 *
 * Pure and framework-free, like assignment-clock.ts next door, so it runs on the
 * server for the weekly sweep and in the browser for the student's own screen
 * and the two always agree. All date maths is calendar days in IST.
 */

export type CatchupPaceState = 'on_track' | 'behind' | 'done';

export interface CatchupPaceInput {
  /** The day the journey's clock starts (YYYY-MM-DD). */
  started_on: string;
  /** Classes expected per week. */
  weekly_quota: number;
  /** Items that count: not excluded, not excused, not awaiting the teacher. */
  total_items: number;
  /** How many of those are finished. */
  completed_items: number;
}

export interface CatchupPace {
  /** Whole weeks since the clock started. */
  weeks_elapsed: number;
  /** How many should be done by today. */
  expected_by_now: number;
  /** How many they are short. Zero when on track. */
  deficit: number;
  state: CatchupPaceState;
  /** The day the next unfinished class is due (YYYY-MM-DD), or null when done. */
  next_due_on: string | null;
  /** The day the whole backlog is due, or null when there is nothing to do. */
  finish_by: string | null;
  /** Classes still to clear. */
  remaining: number;
}

const DAY_MS = 86_400_000;

/** Today in IST as YYYY-MM-DD. */
export function istTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function dayEpoch(ymdOrIso: string): number {
  return Date.parse(`${ymdOrIso.slice(0, 10)}T00:00:00Z`);
}

function addDays(ymd: string, days: number): string {
  return new Date(dayEpoch(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}

function diffDays(from: string, to: string): number {
  return Math.round((dayEpoch(to) - dayEpoch(from)) / DAY_MS);
}

/**
 * The day the Nth item is due (1-based), which is the last day of the week its
 * quota slot falls in. With a quota of 2, items 1 and 2 are due on day 7, items
 * 3 and 4 on day 14.
 */
export function itemDueOn(startedOn: string, weeklyQuota: number, n: number): string {
  const quota = Math.max(1, Math.floor(weeklyQuota) || 1);
  const week = Math.ceil(Math.max(1, n) / quota);
  return addDays(startedOn, week * 7 - 1);
}

/**
 * Where a student stands against their quota.
 *
 * `todayStr` defaults to IST today; pass it explicitly to evaluate a whole
 * cohort against one consistent "now".
 */
export function computeCatchupPace(
  input: CatchupPaceInput,
  todayStr: string = istTodayStr(),
): CatchupPace {
  const quota = Math.max(1, Math.floor(input.weekly_quota) || 1);
  const total = Math.max(0, input.total_items);
  const completed = Math.min(Math.max(0, input.completed_items), total);
  const remaining = total - completed;

  // A student gets the whole first week before anything is "late": on day 3 of
  // week one, nothing is owed yet.
  const daysElapsed = Math.max(0, diffDays(input.started_on, todayStr));
  const weeksElapsed = Math.floor(daysElapsed / 7);
  const expectedByNow = Math.min(total, quota * weeksElapsed);
  const deficit = Math.max(0, expectedByNow - completed);

  let state: CatchupPaceState;
  if (remaining === 0) state = 'done';
  else if (deficit > 0) state = 'behind';
  else state = 'on_track';

  return {
    weeks_elapsed: weeksElapsed,
    expected_by_now: expectedByNow,
    deficit,
    state,
    next_due_on: remaining > 0 ? itemDueOn(input.started_on, quota, completed + 1) : null,
    finish_by: total > 0 ? itemDueOn(input.started_on, quota, total) : null,
    remaining,
  };
}

/**
 * One line telling the student where they stand. Kept here rather than in the
 * component so the weekly nudge and the screen say the same thing.
 */
export function describeCatchupPace(pace: CatchupPace, quota: number): string {
  if (pace.state === 'done') return 'You are all caught up. Nothing left on your list.';
  if (pace.state === 'behind') {
    const n = pace.deficit;
    return `You are ${n} ${n === 1 ? 'class' : 'classes'} behind. Clear ${n === 1 ? 'it' : 'them'} this week to get back on track.`;
  }
  const perWeek = `${quota} ${quota === 1 ? 'class' : 'classes'} a week`;
  return `You are on track. Keep going at ${perWeek} and you will be level with the class.`;
}
