/**
 * Deciding that a student's pre-class work has become a pattern.
 *
 * The teacher's own words: "if they are doing it for very long time not
 * completing, we want to let the parent know". So the bar is not one missed
 * deadline, it is a habit, and the numbers below exist to draw that line
 * somewhere a teacher can defend out loud to a parent.
 *
 * Pure, so the cron and the queue screen agree on who is flagged and why.
 */

/** A rolling window, so a student who fixes it drops out on their own. */
export const PREWORK_WINDOW_DAYS = 28;

/**
 * Absolute floor. Prework will realistically be set about twice a week, so 28
 * days is roughly 8 items. Without a floor, a classroom that set only two pieces
 * of prework all month would report a student home for missing both, on a "100%
 * miss rate" computed from a sample of two.
 */
export const PREWORK_MIN_MISSES = 4;

/**
 * And a rate, so volume alone cannot trip it. A student who did 7 of 11 is not
 * the student this is for.
 */
export const PREWORK_MIN_RATE = 0.6;

/**
 * Said "I have started it, I just need more time" this many times without ever
 * submitting. Surfaced as a LABEL on the queue row, never as a threshold of its
 * own: it colours the conversation, it does not start one.
 */
export const PREWORK_STARTED_CLAIM_LABEL_AT = 3;

export interface ChronicPreworkInput {
  /** Published prework whose deadline passed with nothing submitted. */
  misses: number;
  /** Published prework that fell due in the window while they were enrolled. */
  applicable: number;
  /** Of those misses, how many they gave a reason for. */
  explained: number;
  /** How many they did submit, for the label. */
  submitted: number;
  /** How many times they said they had started it and then did not finish. */
  startedClaims: number;
}

export interface ChronicPreworkResult {
  flagged: boolean;
  /** misses / applicable, 0 when there is nothing to divide. */
  rate: number;
  /** "4 of 6 missed in the last 4 weeks", the sentence the teacher reads. */
  label: string;
  /** Extra context worth showing beside the label, may be empty. */
  notes: string[];
}

/**
 * Smallest flaggable case is 4 of 6, which reads as "he has not done four of the
 * last six". 4 of 7 does not flag (0.6 x 7 = 4.2), and that boundary is pinned
 * by a test because it is the one that decides whether a parent gets called.
 */
export function evaluateChronicPrework(input: ChronicPreworkInput): ChronicPreworkResult {
  const applicable = Math.max(0, input.applicable);
  const misses = Math.max(0, input.misses);
  const rate = applicable > 0 ? misses / applicable : 0;

  const flagged = applicable > 0 && misses >= PREWORK_MIN_MISSES && misses >= PREWORK_MIN_RATE * applicable;

  const weeks = Math.round(PREWORK_WINDOW_DAYS / 7);
  const label = `${misses} of ${applicable} missed in the last ${weeks} weeks`;

  const notes: string[] = [];
  if (input.startedClaims >= PREWORK_STARTED_CLAIM_LABEL_AT) {
    notes.push(`Said "nearly done" ${input.startedClaims} times`);
  }
  // Explained misses still count towards the flag, which is the whole point: a
  // reason is not a substitute for the work. But a student who explains every
  // time is a different conversation from one who says nothing, so say which.
  if (misses > 0 && input.explained === misses) {
    notes.push('Gave a reason every time');
  } else if (misses > 0 && input.explained === 0) {
    notes.push('Never said why');
  }

  return { flagged, rate, label, notes };
}

/**
 * The window start as YYYY-MM-DD, given today in IST.
 *
 * Arithmetic on UTC date parts, deliberately. Building the date as
 * `${today}T00:00:00+05:30` and then calling toISOString() shifts it back 5.5
 * hours into the previous UTC day, so the window silently started a day early.
 * These are calendar days, not instants, so keep them out of timezones entirely.
 */
export function preworkWindowStart(todayIso: string): string {
  const [y, m, d] = todayIso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return todayIso.slice(0, 10);
  const start = new Date(Date.UTC(y, m - 1, d - PREWORK_WINDOW_DAYS));
  return start.toISOString().slice(0, 10);
}
