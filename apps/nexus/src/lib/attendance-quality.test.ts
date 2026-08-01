import { describe, it, expect } from 'vitest';
import {
  barelyAttendedCutoff,
  scheduledMinutes,
  rankByTimeInRoom,
  bucketFor,
  tallyBuckets,
  BARELY_ATTENDED_FLOOR_MIN,
} from './attendance-quality';

describe('barelyAttendedCutoff', () => {
  it('uses the ratio for a long class', () => {
    // The 90 minute evening class, which is nearly every class here.
    expect(barelyAttendedCutoff(90)).toBe(23);
    expect(barelyAttendedCutoff(120)).toBe(30);
  });

  it('uses the floor for a short class, so a 20 minute session flags nobody at 5 minutes', () => {
    expect(barelyAttendedCutoff(20)).toBe(BARELY_ATTENDED_FLOOR_MIN);
    expect(barelyAttendedCutoff(30)).toBe(BARELY_ATTENDED_FLOOR_MIN);
  });

  it('falls back to the floor when the length is missing or nonsense', () => {
    expect(barelyAttendedCutoff(0)).toBe(BARELY_ATTENDED_FLOOR_MIN);
    expect(barelyAttendedCutoff(-30)).toBe(BARELY_ATTENDED_FLOOR_MIN);
    expect(barelyAttendedCutoff(Number.NaN)).toBe(BARELY_ATTENDED_FLOOR_MIN);
  });
});

describe('scheduledMinutes', () => {
  it('measures the evening class', () => {
    expect(scheduledMinutes('19:00:00', '20:30:00')).toBe(90);
    expect(scheduledMinutes('19:00', '20:00')).toBe(60);
  });

  it('returns 0 rather than a negative span for unusable times', () => {
    expect(scheduledMinutes('20:30', '19:00')).toBe(0);
    expect(scheduledMinutes('', '')).toBe(0);
  });
});

describe('rankByTimeInRoom', () => {
  it('puts the shortest stay first', () => {
    const ranked = rankByTimeInRoom([
      { duration_minutes: 90 },
      { duration_minutes: 6 },
      { duration_minutes: 45 },
    ]);
    expect(ranked.map((r) => r.duration_minutes)).toEqual([6, 45, 90]);
  });

  it('puts an unknown duration LAST, never first', () => {
    // The invariant that matters: this list means "these people were barely
    // here", and "we do not know" must not head it.
    const ranked = rankByTimeInRoom([
      { duration_minutes: null },
      { duration_minutes: 6 },
      { duration_minutes: undefined },
      { duration_minutes: 90 },
    ]);
    expect(ranked.slice(0, 2).map((r) => r.duration_minutes)).toEqual([6, 90]);
    expect(ranked.slice(2).every((r) => r.duration_minutes == null)).toBe(true);
  });

  it('breaks a tie on who left first', () => {
    const ranked = rankByTimeInRoom([
      { duration_minutes: 30, left_at: '2026-07-31T15:00:00Z' },
      { duration_minutes: 30, left_at: '2026-07-31T14:00:00Z' },
    ]);
    expect(ranked[0].left_at).toBe('2026-07-31T14:00:00Z');
  });

  it('does not mutate the input', () => {
    const rows = [{ duration_minutes: 90 }, { duration_minutes: 6 }];
    rankByTimeInRoom(rows);
    expect(rows.map((r) => r.duration_minutes)).toEqual([90, 6]);
  });
});

describe('bucketFor', () => {
  it('counts a student who opted out and then came anyway as attended', () => {
    // Reading the RSVP ahead of the register would put someone who sat through
    // the whole class onto a chase list.
    expect(bucketFor({ attended: true, rsvp: 'not_attending' })).toBe('attended');
  });

  it('treats an excused absence as closed, even when they gave a reason', () => {
    expect(
      bucketFor({ attended: false, absence: { excused_at: '2026-08-01T00:00:00Z', reason_code: 'family' } }),
    ).toBe('excused');
  });

  it('treats a caught-up absence as done, ahead of the reason', () => {
    expect(
      bucketFor({ attended: false, absence: { caught_up_at: '2026-08-01T00:00:00Z' } }),
    ).toBe('caught_up');
  });

  it('reads a reason from the absence row or from the RSVP', () => {
    expect(bucketFor({ attended: false, absence: { reason_code: 'exam' } })).toBe('missed_with_reason');
    expect(bucketFor({ attended: false, absence: { reason_note: 'Extra class' } })).toBe(
      'missed_with_reason',
    );
    expect(bucketFor({ attended: false, rsvp: 'not_attending' })).toBe('missed_with_reason');
  });

  it('leaves silence as the one bucket that needs a person', () => {
    expect(bucketFor({ attended: false })).toBe('missed_no_reason');
    expect(bucketFor({ attended: false, rsvp: 'attending', absence: null })).toBe('missed_no_reason');
  });
});

describe('tallyBuckets', () => {
  it('counts every student exactly once', () => {
    const tally = tallyBuckets([
      { attended: true },
      { attended: true, rsvp: 'not_attending' },
      { attended: false, absence: { reason_code: 'exam' } },
      { attended: false, absence: { caught_up_at: 'x' } },
      { attended: false },
      { attended: false },
    ]);
    expect(tally).toEqual({
      attended: 2,
      excused: 0,
      caught_up: 1,
      missed_with_reason: 1,
      missed_no_reason: 2,
    });
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(6);
  });
});
