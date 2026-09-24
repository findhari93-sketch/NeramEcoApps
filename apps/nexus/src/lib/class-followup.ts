/**
 * What happened to each student after ONE class, in one word.
 *
 * The founder's question about a class that has run is not "who was absent"
 * but "is anything left to do about it", and the answer has four corners:
 *
 *                     caught up          not yet
 *   told us why       caught_up          catching_up
 *   said nothing      caught_up_silent   needs_call
 *
 * Around that grid sit the states that belong on neither axis: the students
 * who came (whole or partly), the ones who could not start because the recap
 * is not out yet (our gap, never theirs), the ones who joined the course after
 * the class ran, and the ones a teacher excused.
 *
 * Every screen about one class reads this, so the drawer's card, the dialog's
 * groups and the copied list can never file the same student in two places.
 * "Told us why" is always the RESOLVED reason (absence-reason.ts): an away
 * window or an RSVP decline counts exactly as a reason typed afterwards does.
 *
 * Pure: no I/O.
 */

import { daysBetween, istYmd } from './catchup-diagnosis';

export type FollowupState =
  | 'attended'
  | 'partly'
  | 'needs_call'
  | 'catching_up'
  | 'waiting_on_us'
  | 'late_joiner'
  | 'caught_up_silent'
  | 'caught_up'
  | 'excused'
  /** Attendance was never read for this class, so nothing can be said. */
  | 'unmeasured';

export interface FollowupInput {
  attended: boolean;
  /** Came, but late, left early, dropped out mid class or barely there. */
  partly?: boolean;
  /** Whether Teams attendance has been read for this class at all. */
  measured: boolean;
  joinedAfterClass?: boolean;
  /** A resolved reason exists (away window, RSVP decline, or said afterwards). */
  hasReason: boolean;
  /** There is an absence row for this student and class. */
  hasAbsence: boolean;
  excused?: boolean;
  caughtUp?: boolean;
  /** resolveCatchupBacklog's status for this class, when there is one. */
  catchupStatus?: string | null;
}

export function followupState(s: FollowupInput): FollowupState {
  if (s.attended) return s.partly ? 'partly' : 'attended';
  // An unsynced class says nothing about who was there. The absence rows are
  // derived from the register, so without one there is no row either, but a
  // teacher-marked absence still counts.
  if (!s.measured && !s.hasAbsence) return 'unmeasured';
  if (s.excused) return 'excused';
  if (s.caughtUp) return s.hasReason || s.joinedAfterClass ? 'caught_up' : 'caught_up_silent';
  // Ours before theirs: a student cannot catch up on a recap nobody published,
  // and calling them about it blames them for our gap.
  if (s.catchupStatus === 'blocked' || s.catchupStatus === 'pending_teacher') return 'waiting_on_us';
  if (s.joinedAfterClass) return 'late_joiner';
  return s.hasReason ? 'catching_up' : 'needs_call';
}

/**
 * The state for a payload from before `followup` was sent, worked out from the
 * older seven-way bucket. Away counts as told-us-why, which it always was.
 */
export function stateFromBucket(bucket: string | null | undefined): FollowupState {
  switch (bucket) {
    case 'attended':
      return 'attended';
    case 'excused':
      return 'excused';
    case 'caught_up':
      return 'caught_up';
    case 'late_joiner':
      return 'late_joiner';
    case 'missed_no_reason':
      return 'needs_call';
    default:
      return 'catching_up';
  }
}

export type FollowupTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export const FOLLOWUP_META: Record<FollowupState, { label: string; short: string; tone: FollowupTone; hint: string }> = {
  needs_call: {
    label: 'Said nothing, not caught up',
    short: 'Needs a call',
    tone: 'error',
    hint: 'Missed the class, gave no reason and has not caught up. Ask them why.',
  },
  catching_up: {
    label: 'Told us why, still catching up',
    short: 'Catching up',
    tone: 'warning',
    hint: 'The absence is explained. The catch-up is not finished yet.',
  },
  waiting_on_us: {
    label: 'Waiting on us',
    short: 'Waiting on us',
    tone: 'neutral',
    hint: 'No recap or recording for them yet, so there is nothing they can do.',
  },
  late_joiner: {
    label: 'Joined after this class',
    short: 'Joined later',
    tone: 'info',
    hint: 'Enrolled after the class ran. They owe the recording, not a reason.',
  },
  caught_up_silent: {
    label: 'Caught up, never said why',
    short: 'Caught up, no reason',
    tone: 'info',
    hint: 'Did the catch-up but never told us why they missed the class.',
  },
  caught_up: {
    label: 'Told us why and caught up',
    short: 'Caught up',
    tone: 'success',
    hint: 'Explained the absence and finished the catch-up.',
  },
  excused: { label: 'Excused', short: 'Excused', tone: 'neutral', hint: 'A teacher excused this class.' },
  partly: {
    label: 'Came, missed part of it',
    short: 'Partly there',
    tone: 'warning',
    hint: 'Joined late, left early, or dropped out for part of the class.',
  },
  attended: { label: 'Came to class', short: 'Came', tone: 'success', hint: 'In the class.' },
  unmeasured: { label: 'Not recorded', short: 'Not recorded', tone: 'neutral', hint: 'Attendance not synced yet.' },
};

/** The missed-side groups, in the order a teacher should work through them. */
export const MISSED_ORDER: FollowupState[] = [
  'needs_call',
  'catching_up',
  'waiting_on_us',
  'late_joiner',
  'caught_up_silent',
  'caught_up',
  'excused',
];

/** Still owe the class and can act on it: what "Select all" and nudges cover. */
export const OUTSTANDING: FollowupState[] = ['needs_call', 'catching_up', 'late_joiner'];

export const MISSED_STATES = new Set<FollowupState>(MISSED_ORDER);

export type FollowupTally = Record<FollowupState, number>;

export function emptyFollowupTally(): FollowupTally {
  return {
    attended: 0,
    partly: 0,
    needs_call: 0,
    catching_up: 0,
    waiting_on_us: 0,
    late_joiner: 0,
    caught_up_silent: 0,
    caught_up: 0,
    excused: 0,
    unmeasured: 0,
  };
}

export function tallyFollowup(states: FollowupState[]): FollowupTally {
  const t = emptyFollowupTally();
  for (const s of states) t[s] += 1;
  return t;
}

/** Whole days from the class to the catch-up, IST. Null when unfinished. */
export function daysToCatchUp(classDate: string, caughtUpAt: string | null | undefined): number | null {
  if (!caughtUpAt) return null;
  const day = istYmd(caughtUpAt);
  if (!day) return null;
  return Math.max(0, daysBetween(classDate, day));
}

/** Median, rounded, so one student who took four months does not describe the class. */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/** Missed this many of the recent classes before a missed row is flagged irregular. */
export const IRREGULAR_MISSED = 3;

export function isIrregular(recent: { missed: number; of: number } | null | undefined): boolean {
  return !!recent && recent.of >= IRREGULAR_MISSED && recent.missed >= IRREGULAR_MISSED;
}
