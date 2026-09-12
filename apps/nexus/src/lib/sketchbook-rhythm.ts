/**
 * Sketchbook rhythm engine. PURE: no Date.now(), no database, no timezone
 * guesses. Every date in and out is a YYYY-MM-DD string in Asia/Kolkata.
 *
 * Why a weekly goal and not a daily chain: a chain punishes hardest right after
 * the best run (school exams, travel, one tired night) and most students quit
 * after the first break. A weekly goal turns "draw every alternate day" into
 * "3 of 7 days", which is what the teacher actually wants, and a missed day
 * never resets anything the student can see.
 *
 * Why goal history: the teacher starts a class at 3 and raises it to 4 or 5
 * later. A week is judged by the goal in force at its Monday, so raising the
 * goal never erases a run earned under the old one.
 */

export const DEFAULT_WEEKLY_GOAL = 3;

export interface GoalChange {
  /** YYYY-MM-DD, a Monday. */
  effectiveFrom: string;
  goal: number;
}

export interface WeekRhythm {
  /** Monday, YYYY-MM-DD. */
  start: string;
  /** Mon..Sun. */
  days: boolean[];
  count: number;
  goal: number;
  met: boolean;
}

export interface Rhythm {
  week: WeekRhythm;
  /** Consecutive weeks meeting the goal, ending last week, plus this week once met. */
  run: number;
  bestRun: number;
  totalDays: number;
  lastPracticeDate: string | null;
  /** Days since the last practice day. Null when there is none yet. */
  quietDays: number | null;
}

const DAY_MS = 86_400_000;

export function istDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  // en-CA renders as YYYY-MM-DD; the timeZone option does the IST shift.
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
}

export function weekStart(date: string): string {
  const d = toUtc(date);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return fromUtc(d);
}

export function goalForWeek(
  weekStartDate: string,
  history: GoalChange[],
  fallback: number = DEFAULT_WEEKLY_GOAL,
): number {
  let goal = fallback;
  let best = '';
  for (const h of history) {
    if (h.effectiveFrom <= weekStartDate && h.effectiveFrom >= best) {
      best = h.effectiveFrom;
      goal = h.goal;
    }
  }
  return goal;
}

function weekOf(start: string, set: Set<string>, history: GoalChange[], fallback: number): WeekRhythm {
  const days = Array.from({ length: 7 }, (_, i) => set.has(addDays(start, i)));
  const count = days.filter(Boolean).length;
  const goal = goalForWeek(start, history, fallback);
  return { start, days, count, goal, met: count >= goal };
}

export function computeRhythm(
  practiceDates: string[],
  today: string,
  history: GoalChange[],
  fallbackGoal: number = DEFAULT_WEEKLY_GOAL,
): Rhythm {
  const set = new Set(practiceDates);
  const thisStart = weekStart(today);
  const week = weekOf(thisStart, set, history, fallbackGoal);

  if (set.size === 0) {
    return { week, run: 0, bestRun: 0, totalDays: 0, lastPracticeDate: null, quietDays: null };
  }

  const sorted = [...set].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstStart = weekStart(first);

  // Walk every week from the first practice week up to last week, in order,
  // to find the best run; then the run that is still alive.
  let bestRun = 0;
  let current = 0;
  for (let s = firstStart; s < thisStart; s = addDays(s, 7)) {
    if (weekOf(s, set, history, fallbackGoal).met) {
      current += 1;
      if (current > bestRun) bestRun = current;
    } else {
      current = 0;
    }
  }
  let run = current; // consecutive met weeks ending last week
  if (week.met) {
    run += 1;
    if (run > bestRun) bestRun = run;
  }

  return {
    week,
    run,
    bestRun,
    totalDays: set.size,
    lastPracticeDate: last,
    quietDays: Math.max(0, daysBetween(last, today)),
  };
}

export function thenAndNow<T extends { submitted_at: string }>(
  sketches: T[],
): { first: T; latest: T } | null {
  if (sketches.length < 8) return null;
  const sorted = [...sketches].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  if (daysBetween(istDate(first.submitted_at), istDate(latest.submitted_at)) < 30) return null;
  return { first, latest };
}

export function milestoneReached(totalSketches: number): 7 | 30 | 100 | null {
  if (totalSketches === 7 || totalSketches === 30 || totalSketches === 100) return totalSketches;
  return null;
}

/** The one line under the dots. Never "0 of 3": an empty sketchbook gets an invitation. */
export function rhythmLine(r: Rhythm): string {
  if (r.totalDays === 0) {
    return `Start your rhythm. ${r.week.goal} practice days a week is the goal.`;
  }
  const base = `${r.week.count} of ${r.week.goal} days this week.`;
  if (r.week.met && r.run > 1) {
    return `${base} Good rhythm, ${r.run} weeks running.`;
  }
  if (r.week.met) return `${base} Goal met.`;
  return base;
}
