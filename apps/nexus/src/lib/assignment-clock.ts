/**
 * Assignment "personal clock". The same assignment is due at different real
 * dates for different students, so ranking and reminders are fair:
 *
 *   - A student enrolled BEFORE the class works to the class due date (`due_at`).
 *   - A LATE JOINER (enrolled after the class happened) works to their own
 *     deadline: their join date + the assignment's `catchup_window_days`, and
 *     the app shows "Day N since you joined". The original class due date, long
 *     past by the time they enrol, is ignored for them.
 *
 * Pure and framework-free so it can run on the server (leaderboard scoring,
 * engagement rollups) and the client (student cards) alike. All date math uses
 * calendar days in IST; times of day are ignored except when deciding if a
 * specific submission beat its deadline.
 */

export type AssignmentClockStatus = 'not_due' | 'due_soon' | 'overdue' | 'no_deadline';

export interface AssignmentClockInput {
  /** The class day the assignment was handed out (YYYY-MM-DD). */
  class_date: string;
  /** The student's enrolment timestamp (ISO), or null if unknown. */
  enrolled_at: string | null;
  /** Class due date for on-time students (ISO), or null = no due date. */
  due_at: string | null;
  /** Days a late joiner gets from their join date. */
  catchup_window_days: number;
}

export interface AssignmentClock {
  /** True when the student enrolled after the class day (works to a personal deadline). */
  is_late_joiner: boolean;
  /** The day this assignment's clock starts for this student (YYYY-MM-DD). */
  personal_start: string;
  /** The day it is due for this student (YYYY-MM-DD), or null = no deadline. */
  personal_due: string | null;
  /** Whole days since the personal start (0 on the start day, never negative). */
  days_elapsed: number;
  /** Whole days until the personal due date; negative = past due; null = no deadline. */
  days_remaining: number | null;
  /** Coarse status for badges/colours. */
  status: AssignmentClockStatus;
}

const DAY_MS = 86_400_000;

/** Today in IST as YYYY-MM-DD. */
export function istTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Parse a YYYY-MM-DD (or ISO) date to a UTC-midnight epoch for whole-day math. */
function dayEpoch(ymdOrIso: string): number {
  const ymd = ymdOrIso.slice(0, 10);
  return Date.parse(`${ymd}T00:00:00Z`);
}

/** Add `days` calendar days to a YYYY-MM-DD, returning YYYY-MM-DD. */
function addDays(ymd: string, days: number): string {
  return new Date(dayEpoch(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
function diffDays(from: string, to: string): number {
  return Math.round((dayEpoch(to) - dayEpoch(from)) / DAY_MS);
}

/**
 * Compute a student's personal clock for one assignment.
 * `todayStr` defaults to IST today; pass it explicitly to keep a batch of rows
 * evaluated against a single consistent "now".
 */
export function computeAssignmentClock(
  input: AssignmentClockInput,
  todayStr: string = istTodayStr(),
): AssignmentClock {
  const classDay = input.class_date.slice(0, 10);
  const enrolledDay = input.enrolled_at ? input.enrolled_at.slice(0, 10) : null;
  const isLateJoiner = !!enrolledDay && enrolledDay > classDay;

  // The clock starts on the later of "class handed out" and "student joined".
  const personalStart = enrolledDay && enrolledDay > classDay ? enrolledDay : classDay;

  let personalDue: string | null;
  if (isLateJoiner) {
    // Late joiners always get a fresh personal window from their start day.
    personalDue = addDays(personalStart, Math.max(0, input.catchup_window_days || 0));
  } else {
    // On-time students follow the class due date (its date part), if any.
    personalDue = input.due_at ? input.due_at.slice(0, 10) : null;
  }

  const daysElapsed = Math.max(0, diffDays(personalStart, todayStr));
  const daysRemaining = personalDue ? diffDays(todayStr, personalDue) : null;

  let status: AssignmentClockStatus;
  if (personalDue === null) status = 'no_deadline';
  else if (daysRemaining! < 0) status = 'overdue';
  else if (daysRemaining! <= 2) status = 'due_soon';
  else status = 'not_due';

  return {
    is_late_joiner: isLateJoiner,
    personal_start: personalStart,
    personal_due: personalDue,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    status,
  };
}

/**
 * Did a submission beat this student's personal deadline? True when there is no
 * deadline. Compares the submission's calendar day against the personal due day
 * (inclusive: submitting on the due day counts as on time).
 */
export function isSubmissionOnTime(
  input: AssignmentClockInput,
  submittedAtIso: string,
): boolean {
  const clock = computeAssignmentClock(input, submittedAtIso.slice(0, 10));
  if (!clock.personal_due) return true;
  return submittedAtIso.slice(0, 10) <= clock.personal_due;
}
