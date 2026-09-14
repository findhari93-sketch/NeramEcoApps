/**
 * Where a student stands with their drawing rhythm, for the teacher's Class
 * rhythm screen and the reminder cron. PURE, like sketchbook-rhythm.ts: every
 * date in and out is a YYYY-MM-DD string in Asia/Kolkata.
 *
 * The rule this file exists for: a student is only ever judged from the day
 * tracking started for THEM, which is the latest of
 *   - the day the sketchbook opened for their classroom,
 *   - the day they enrolled,
 *   - the day they were brought back from dormant.
 * Before this, a student who had never drawn read "No sketches in 8 weeks" the
 * day after launch, and a student un-paused yesterday would read "9 days quiet".
 *
 * A practice day is any day with any drawing upload (sketchbook, drawing
 * assignment, question bank, free practice). A student who drew for homework
 * has drawn.
 */

import { addDays, daysBetween, istDate, weekStart } from './sketchbook-rhythm';

export type RhythmStatus = 'needs_call' | 'needs_nudge' | 'behind' | 'not_started' | 'on_track';

/** Card order on the Class rhythm screen: who needs the teacher first. */
export const RHYTHM_STATUS_ORDER: readonly RhythmStatus[] = ['needs_call', 'needs_nudge', 'behind', 'not_started', 'on_track'];

export const RHYTHM_STATUS_LABEL: Record<RhythmStatus, string> = {
  needs_call: 'Needs a call',
  needs_nudge: 'Needs a nudge',
  behind: 'Behind goal',
  not_started: 'Not started',
  on_track: 'On track',
};

/** Quiet this many days and the student needs a nudge. The reminder cron sends on 3, 6 and 9. */
export const QUIET_NUDGE_DAYS = 3;
/** After this many automatic reminders in one quiet stretch, a person should call. */
export const REMINDERS_BEFORE_CALL = 3;
export const QUIET_CALL_DAYS = 9;

function maxDate(...dates: Array<string | null | undefined>): string {
  return dates.filter((d): d is string => !!d).reduce((a, b) => (b > a ? b : a));
}

export function trackingStart(input: {
  classroomStartedOn: string;
  /** nexus_enrollments.enrolled_at, an ISO timestamp. */
  enrolledAt: string | null;
  /** IST date the student was last brought back from dormant. */
  reactivatedOn?: string | null;
}): string {
  return maxDate(input.classroomStartedOn, input.enrolledAt ? istDate(input.enrolledAt) : null, input.reactivatedOn);
}

/** Unique, sorted, and only days on or after the start and not after today. */
export function clampDates(dates: string[], start: string, today: string): string[] {
  return [...new Set(dates)].filter((d) => d >= start && d <= today).sort();
}

export function quietClock(start: string, lastDrawing: string | null, today: string): { since: string; quietDays: number } {
  const since = lastDrawing && lastDrawing >= start ? lastDrawing : start;
  return { since, quietDays: Math.max(0, daysBetween(since, today)) };
}

/**
 * The goal for a week that tracking joined part way through. A class that opens
 * on a Saturday cannot draw 3 days that week, and telling it "Behind" on day one
 * would be the same false alarm this file was written to remove.
 */
export function proratedGoal(goal: number, weekStartDate: string, start: string): number {
  const lateBy = daysBetween(weekStartDate, start);
  if (lateBy <= 0) return goal;
  const available = 7 - lateBy;
  if (available <= 0) return goal;
  return Math.max(1, Math.ceil((goal * available) / 7));
}

export type StripState = 'drew' | 'missed' | 'open' | 'future' | 'before_start';

export interface StripDay {
  date: string;
  state: StripState;
  today: boolean;
}

/** Last week and this week, Monday to Sunday: 14 squares. */
export function twoWeekStrip(dates: string[], today: string, start: string): StripDay[] {
  const set = new Set(dates);
  const first = addDays(weekStart(today), -7);
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(first, i);
    const isToday = date === today;
    let state: StripState;
    if (date > today) state = 'future';
    else if (set.has(date)) state = 'drew';
    else if (date < start) state = 'before_start';
    else if (isToday) state = 'open';
    else state = 'missed';
    return { date, state, today: isToday };
  });
}

export interface RhythmStatusInput {
  /** Practice days, already clamped to the tracking start. */
  dates: string[];
  today: string;
  /** This student's tracking start (see trackingStart). */
  start: string;
  /** The classroom goal in force this week, before proration. */
  goal: number;
  /** IST date of enrolment, for "New this week". */
  enrolledOn: string | null;
  /** Weeks running, from computeRhythm. */
  run: number;
  /** Automatic reminders already sent in the current quiet stretch. */
  autoRemindersThisCycle: number;
}

export interface RhythmStatusResult {
  status: RhythmStatus;
  label: string;
  quietDays: number;
  lastDrawingDate: string | null;
  week: { count: number; goal: number };
  strip: StripDay[];
}

export function rhythmStatus(input: RhythmStatusInput): RhythmStatusResult {
  const { today, start, run } = input;
  const dates = clampDates(input.dates, start, today);
  const thisWeek = weekStart(today);
  const count = dates.filter((d) => d >= thisWeek).length;
  const goal = proratedGoal(input.goal, thisWeek, start);
  const last = dates.length ? dates[dates.length - 1] : null;
  const { quietDays } = quietClock(start, last, today);
  const strip = twoWeekStrip(dates, today, start);
  const week = { count, goal };
  const done = (status: RhythmStatus, label: string): RhythmStatusResult => ({
    status, label, quietDays, lastDrawingDate: last, week, strip,
  });

  if (input.autoRemindersThisCycle >= REMINDERS_BEFORE_CALL && quietDays >= QUIET_CALL_DAYS) {
    return done('needs_call', 'Needs a call');
  }
  if (quietDays >= QUIET_NUDGE_DAYS) {
    return done('needs_nudge', last ? `Quiet ${quietDays} days` : `No drawing yet, ${quietDays} days`);
  }
  if (!last) {
    const recent = input.enrolledOn !== null && daysBetween(input.enrolledOn, today) < 7;
    return done('not_started', recent ? 'New this week' : 'Not started yet');
  }
  if (count >= goal) {
    return done('on_track', run > 1 ? `${run} weeks running` : 'Goal met');
  }

  // Monday = 0. Today still counts as a day the student can draw.
  const dayIndex = daysBetween(thisWeek, today);
  const daysLeft = 7 - dayIndex;
  const firstCountedDay = start > thisWeek ? start : thisWeek;
  const availableDays = 7 - daysBetween(thisWeek, firstCountedDay);
  const elapsed = Math.max(0, daysBetween(firstCountedDay, today));
  const due = availableDays > 0 ? Math.floor((goal * elapsed) / availableDays) : 0;
  if (goal - count > daysLeft || count < due) {
    return done('behind', `Behind, ${count} of ${goal}`);
  }
  return done('on_track', 'On track');
}

/** Status order first, then the longest quiet, so the list reads top down as "who needs me". */
export function compareByNeed(
  a: { status: RhythmStatus; quietDays: number },
  b: { status: RhythmStatus; quietDays: number },
): number {
  const byStatus = RHYTHM_STATUS_ORDER.indexOf(a.status) - RHYTHM_STATUS_ORDER.indexOf(b.status);
  if (byStatus !== 0) return byStatus;
  return b.quietDays - a.quietDays;
}
