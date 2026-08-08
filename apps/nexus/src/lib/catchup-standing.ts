/**
 * What one student's catch-up record adds up to.
 *
 * `catchupBucket` next door answers "what is wrong with this student right now".
 * This answers the two questions that come after it: how much do they actually
 * owe, and have they responded to us. Both were previously read off a raw count
 * of absence rows, which is wrong in one specific and unfair way.
 *
 * A student who enrolled in month three owes a `late_joiner` row for every class
 * taught before they existed here. Sort a cohort by missed classes and the
 * newest joiner tops the list, so the person who has missed nothing since
 * arriving looks like the worst offender in the room. `ownOpen` and
 * `lateJoinerOpen` are separate numbers here, and nothing ever adds them
 * together, so a chase list cannot be built out of the wrong one by accident.
 *
 * The second question is quieter but matters more. "They have a lot outstanding"
 * is not the same claim as "they are ignoring us", and only the second justifies
 * escalating. `unresponsive` is therefore defined against the nudge: we asked,
 * and nothing has moved since. A student nobody has contacted is never
 * unresponsive, because that silence is our failure and not theirs.
 *
 * Pure and dependency-free, like `catchup-buckets.ts`, so the teacher screen,
 * the student wall and the tests all reach the same verdict.
 */
import type { CatchupItemStatus } from '@neram/database';
import { daysBetween } from './catchup-turnaround';

/** One class a student owes or has cleared, flattened to what standing needs. */
export interface StandingItem {
  /** 'no_show' | 'opted_out' | 'late_joiner'. Only late_joiner is treated apart. */
  kind: string | null;
  /** The resolved status, so blocked and pending_teacher are already identified. */
  status: CatchupItemStatus;
  /** The class date, YYYY-MM-DD, IST. */
  scheduledDate: string;
  caughtUpAt: string | null;
  followupSentAt: string | null;
  recordingWatchedAt: string | null;
  /** A DATE, not a timestamp. The IST day a clock was last started. */
  activatedOn: string | null;
}

export interface CatchupStanding {
  /** Classes they finished themselves. Excludes excused, which is our decision. */
  clearedTotal: number;
  /** Open classes they were on the roster for. The only fair number to rank on. */
  ownOpen: number;
  /** Open classes taught before they enrolled. Shown, never ranked on. */
  lateJoinerOpen: number;
  /** Age in days of the oldest class still open. Null when nothing is open. */
  oldestOpenDays: number | null;
  lastClearedAt: string | null;
  /** Median, not mean: one very late class must not define a diligent student. */
  medianDaysToClear: number | null;
  /** The most recent time anybody chased them, across every class. */
  chasedAt: string | null;
  /** We asked, and nothing has moved since. The only honest test of silence. */
  unresponsive: boolean;
}

/**
 * A standing that claims nothing.
 *
 * The catch-up payload is read through a persisted SWR cache, so the first frame
 * after this ships can be a payload written by yesterday's build, with rows that
 * have no `standing` at all. Reading `.ownOpen` off undefined there throws during
 * render, and the teacher segment has no error boundary over it, so the crash
 * takes the whole shell. See components/catchup/payload.ts.
 */
export const EMPTY_STANDING: CatchupStanding = {
  clearedTotal: 0,
  ownOpen: 0,
  lateJoinerOpen: 0,
  oldestOpenDays: null,
  lastClearedAt: null,
  medianDaysToClear: null,
  chasedAt: null,
  unresponsive: false,
};

/** Work the student can act on today. Excludes anything we are holding up. */
function isOpen(status: CatchupItemStatus): boolean {
  return status === 'active' || status === 'waiting';
}

/**
 * The IST calendar day an instant falls on.
 *
 * `activated_on` is a DATE and `followup_sent_at` is a timestamptz, so they
 * cannot be compared as strings. Slicing the raw ISO instead would read
 * 2026-08-01T20:00:00Z as the 1st when it is already the 2nd in India, and a
 * student who started the next morning would be filed as ignoring us.
 */
function istDayOf(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function maxIso(values: Array<string | null>): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (Number.isNaN(t)) continue;
    if (best === null || t > new Date(best).getTime()) best = v;
  }
  return best;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * @param items every class this student owes or has cleared in one classroom
 * @param today IST today as YYYY-MM-DD, passed in so a whole cohort is judged
 *              against one consistent day rather than against the clock
 */
export function catchupStanding(items: StandingItem[], today: string): CatchupStanding {
  let clearedTotal = 0;
  let ownOpen = 0;
  let lateJoinerOpen = 0;
  let oldestOpenDays: number | null = null;
  const turnarounds: number[] = [];

  for (const it of items) {
    if (it.caughtUpAt) {
      clearedTotal += 1;
      turnarounds.push(daysBetween(it.scheduledDate, it.caughtUpAt));
    }

    if (!isOpen(it.status)) continue;

    if (it.kind === 'late_joiner') lateJoinerOpen += 1;
    else ownOpen += 1;

    const age = daysBetween(it.scheduledDate, `${today}T00:00:00+05:30`);
    if (oldestOpenDays === null || age > oldestOpenDays) oldestOpenDays = age;
  }

  const chasedAt = maxIso(items.map((i) => i.followupSentAt));

  // A student with nothing left to do cannot be ignoring us, whatever happened
  // before they finished. Testing this first is what keeps a finished student
  // off a chase list even if the last nudge they ever got went unanswered for a
  // week before they cleared everything in one sitting.
  const hasOpenWork = ownOpen + lateJoinerOpen > 0;

  let unresponsive = false;
  if (chasedAt && hasOpenWork) {
    const chasedAtMs = new Date(chasedAt).getTime();
    const chasedDay = istDayOf(chasedAt);
    const movedSince = items.some((it) => {
      const stamps = [it.recordingWatchedAt, it.caughtUpAt];
      if (stamps.some((s) => s && new Date(s).getTime() >= chasedAtMs)) return true;
      // Same IST day counts as a response: the nudge landed in the morning and
      // the date stamp is all we have to say they opened it that afternoon.
      return !!it.activatedOn && it.activatedOn >= chasedDay;
    });
    unresponsive = !movedSince;
  }

  return {
    clearedTotal,
    ownOpen,
    lateJoinerOpen,
    oldestOpenDays,
    lastClearedAt: maxIso(items.map((i) => i.caughtUpAt)),
    medianDaysToClear: median(turnarounds),
    chasedAt,
    unresponsive,
  };
}
