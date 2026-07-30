/**
 * The parent portal's shared status vocabulary.
 *
 * Four surfaces (Home, Classes, Assignments, Tests) show the same handful of
 * states over and over: attended, missed, work done, work outstanding, passed,
 * not recorded. If each page picked its own words and its own colours, a parent
 * would have to relearn the interface on every tab, and worse, the same
 * underlying fact would look different depending on where they saw it.
 *
 * So the mapping from fact to (word, tone, icon) lives here once.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Every entry carries a label as well as a
 * tone, and the components render both. A parent reading this in greyscale, or
 * with the most common form of colour blindness, gets exactly the same
 * information as everyone else.
 *
 * Pure. No React, no DB, so the wording is unit-testable.
 */

import type { AttendanceLabel } from '@/lib/parent-attendance';
import type { ParentClass } from '@/lib/parent-view-types';

/** Maps onto tagSx in components/timetable/timetable-theme.ts. */
export type StatusTone = 'success' | 'warning' | 'error' | 'primary' | 'neutral';

export interface StatusDescriptor {
  label: string;
  tone: StatusTone;
  /** Longer form for a detail panel, where there is room for a sentence. */
  detail?: string;
}

/**
 * Attendance, worded for a parent.
 *
 * Deliberately gentler than a register. "Partly attended" rather than "dropped
 * out", "Missed" rather than "absent". This is a support tool, not a
 * disciplinary record, and the same choice is already made in the underlying
 * labels at lib/parent-attendance.ts.
 *
 * 'not_recorded' is neutral, NEVER error. It means our sync did not run, not
 * that the child did anything. Colouring it red would accuse a child of
 * something an administrator failed to do.
 */
export const ATTENDANCE_STATUS: Record<AttendanceLabel, StatusDescriptor> = {
  attended: { label: 'Attended', tone: 'success' },
  joined_late: { label: 'Joined late', tone: 'warning' },
  left_early: { label: 'Left early', tone: 'warning' },
  partly_attended: { label: 'Partly there', tone: 'warning' },
  missed: { label: 'Missed', tone: 'error' },
  missed_with_reason: { label: 'Missed, reason given', tone: 'primary' },
  not_recorded: {
    label: 'Not recorded',
    tone: 'neutral',
    detail: 'Attendance for this class was never recorded, so it is not counted.',
  },
};

/**
 * How long the child was actually in the room.
 *
 * Returns null rather than a zero when there is nothing measured, so a caller
 * cannot accidentally render "0 of 90 minutes" for a class nobody synced.
 */
export function describeMinutes(cls: ParentClass): string | null {
  const att = cls.attendance;
  if (!att || att.measurement !== 'measured') return null;
  if (typeof att.durationMinutes !== 'number') return null;
  if (!att.scheduledMinutes) return `Present ${att.durationMinutes} minutes`;
  return `Present ${att.durationMinutes} of ${att.scheduledMinutes} minutes`;
}

/** The work badge for one class. Null when the class set no work. */
export function workStatus(cls: ParentClass): StatusDescriptor | null {
  const badge = cls.assignmentBadge;
  if (!badge || badge.total === 0) return null;

  if (badge.doneByChild >= badge.total) {
    return {
      label: badge.total === 1 ? 'Work done' : `Work done (${badge.total})`,
      tone: 'success',
    };
  }
  if (badge.doneByChild === 0) {
    return {
      label: badge.total === 1 ? 'Work pending' : `${badge.total} to do`,
      tone: 'warning',
    };
  }
  return {
    label: `${badge.doneByChild} of ${badge.total} done`,
    tone: 'warning',
  };
}

/** The test badge for one class. Null when no test was linked. */
export function testStatus(cls: ParentClass): StatusDescriptor | null {
  const badge = cls.testBadge;
  if (!badge) return null;

  if (!badge.attempted) {
    return { label: 'Test not taken', tone: 'warning' };
  }
  // bestPct is null-never-zero by contract, so a missing number here means the
  // score genuinely is not known, not that they scored nothing.
  const pct = typeof badge.bestPct === 'number' ? `${Math.round(badge.bestPct)}%` : null;
  if (badge.passed) {
    return { label: pct ? `Test passed, ${pct}` : 'Test passed', tone: 'success' };
  }
  return { label: pct ? `Test ${pct}` : 'Test taken', tone: 'warning' };
}

/**
 * The catch-up badge for a class the child missed or joined after.
 *
 * Null when there is nothing to catch up on, which is the common case and must
 * render as no badge at all rather than a reassuring green one: a row of green
 * "nothing to do" pills would drown the one class that does need attention.
 */
export function catchupStatus(cls: ParentClass): StatusDescriptor | null {
  const badge = cls.catchupBadge;
  if (!badge) return null;
  if (badge.caughtUpAt) return { label: 'Caught up', tone: 'success' };
  if (badge.open) return { label: 'Catch-up open', tone: 'warning' };
  return { label: 'Catch-up done', tone: 'success' };
}

/**
 * The one line about the recording, or null when there is nothing to say.
 *
 * Status only. There is no url in ParentRecordingStatus to leak, by design, so
 * this function could not offer a link even if a future edit tried to.
 */
export function recordingStatus(cls: ParentClass): StatusDescriptor | null {
  const rec = cls.recording;
  if (!rec.available) return null;

  // null means the child was in the class, so the recording is not their
  // problem. Saying "not watched" would read as a criticism of nothing.
  if (rec.watchedByChild === null) {
    return {
      label: 'Recording available',
      tone: 'neutral',
      detail: 'A recording of this class exists. Students can watch it in their own app.',
    };
  }
  if (rec.watchedByChild) {
    return {
      label: 'Recording watched',
      tone: 'success',
      detail:
        rec.proof === 'recap_completed'
          ? 'Your child finished the guided replay of this class.'
          : 'Your child has marked the recording as watched.',
    };
  }
  return {
    label: 'Recording not watched',
    tone: 'warning',
    detail: 'A recording is available and your child has not watched it yet.',
  };
}

/** Reference material: how many, never what. Null when the teacher shared none. */
export function resourceStatus(cls: ParentClass): string | null {
  const n = cls.resources.count;
  if (!n) return null;
  return n === 1
    ? 'The teacher shared 1 reference material for this class.'
    : `The teacher shared ${n} reference materials for this class.`;
}

/**
 * The single most important thing about a past class, for the collapsed row.
 *
 * Ordered by what a parent should act on, not by what is most flattering:
 * an open catch-up outranks outstanding work, which outranks attendance, so the
 * row surfaces the actionable state rather than burying it behind "Attended".
 */
export function headlineStatus(cls: ParentClass): StatusDescriptor | null {
  if (cls.phase === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (cls.phase === 'live') return { label: 'Happening now', tone: 'primary' };
  if (cls.phase === 'upcoming') return null;

  const catchup = catchupStatus(cls);
  if (catchup?.tone === 'warning') return catchup;

  const work = workStatus(cls);
  if (work?.tone === 'warning') return work;

  if (cls.attendance) return ATTENDANCE_STATUS[cls.attendance.label];
  return null;
}
