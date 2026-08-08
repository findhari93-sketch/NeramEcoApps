/**
 * The class-level answer to "did the people who missed this come back, and how
 * fast".
 *
 * A teacher reviewing a class after the fact is not asking who is behind overall,
 * they are asking whether THIS class got made up. The count alone does not
 * answer it: six of nine sounds the same whether the six cleared it the next day
 * or five weeks later, and those are different classes.
 */
import { describe, it, expect } from 'vitest';
import { caughtUpSummary } from './MissedTab';
import type { StudentInsight } from './types';

function student(over: Partial<StudentInsight> = {}): StudentInsight {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Student',
    avatar_url: null,
    rsvp: 'attending',
    reason: null,
    attended: false,
    joined_at: null,
    left_at: null,
    duration_minutes: null,
    joinedLate: false,
    leftEarly: false,
    droppedMidClass: false,
    barelyAttended: false,
    absence: {
      kind: 'no_show',
      reason_code: null,
      reason_note: null,
      reason_source: null,
      reason_submitted_at: null,
      recording_watched_at: null,
      caught_up_at: null,
      excused_at: null,
    },
    bucket: 'missed_no_reason',
    ...over,
  } as StudentInsight;
}

function cleared(after: string): StudentInsight {
  return student({
    absence: { ...student().absence!, caught_up_at: '2026-08-01T10:00:00+05:30' },
    catchup: {
      status: 'done',
      step: 'done',
      watched: true,
      due_on: null,
      days_left: null,
      overdue: false,
      active: false,
      window_days: 7,
      cleared_after: after,
    },
  });
}

describe('caughtUpSummary', () => {
  it('says nothing at all when nobody missed the class', () => {
    // No absences means no follow-up, and a "0 of 0" note is noise on a panel
    // that is already dense.
    expect(caughtUpSummary([student({ attended: true, absence: null })])).toBeNull();
  });

  it('counts how many of the people who missed it came back', () => {
    expect(caughtUpSummary([cleared('the next day'), student(), student()])).toMatch(
      /^1 of 3 caught up/,
    );
  });

  it('reports the median turnaround, not the mean', () => {
    // One student who cleared it four months later must not describe the group.
    const s = caughtUpSummary([cleared('the next day'), cleared('3 days later'), cleared('120 days later')]);
    expect(s).toBe('3 of 3 caught up · median 3 days');
  });

  it('reads same day as zero rather than dropping it', () => {
    // "same day" carries no digits, so a naive parse turns the fastest possible
    // turnaround into NaN and silently removes the best case from the median.
    expect(caughtUpSummary([cleared('same day'), cleared('same day')])).toBe(
      '2 of 2 caught up · median 0 days',
    );
  });

  it('gives the count without a median when nothing has been cleared', () => {
    expect(caughtUpSummary([student(), student()])).toBe('0 of 2 caught up');
  });

  it('ignores students who were in the class', () => {
    const s = caughtUpSummary([cleared('the next day'), student({ attended: true, absence: null })]);
    expect(s).toMatch(/^1 of 1 caught up/);
  });
});
