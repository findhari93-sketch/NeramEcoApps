import { describe, expect, it } from 'vitest';
import {
  attendanceStanding,
  KEEPING_UP_RATE,
  NO_CONTACT_DAYS,
  STANDING_META,
  STANDING_ORDER,
  type StandingInput,
} from './attendance-standing';

const TODAY = '2026-10-01';

function input(over: Partial<StandingInput> = {}): StandingInput {
  return {
    today: TODAY,
    enrolledAt: '2026-01-01T00:00:00Z',
    attendance: { counted: 10, present: 9, away: 0, unexplainedMissed: 1 },
    away: null,
    catchup: { ownOpen: 0, blockedOnUs: 0 },
    seen: { lastSeenAt: '2026-09-30T00:00:00Z', neverEntered: false },
    ...over,
  };
}

const standingOf = (over: Partial<StandingInput> = {}) => attendanceStanding(input(over)).standing;

describe('the three honesty rules', () => {
  /**
   * Rule 1. Attendance sync runs on a delegated Microsoft token, so a class
   * nobody synced looks like the whole roster was missing. Reporting that as
   * "no contact" would accuse an entire cohort of something an administrator
   * failed to do.
   */
  it('says nothing at all when no class in the range was measured', () => {
    expect(standingOf({ attendance: null })).toBe('not_measured');
    expect(standingOf({ attendance: { counted: 0, present: 0, away: 0, unexplainedMissed: 0 } })).toBe(
      'not_measured',
    );
  });

  it('names attendance as unavailable rather than scoring it as zero', () => {
    const result = attendanceStanding(input({ attendance: null }));
    expect(result.unavailable).toContain('attendance');
    expect(result.standing).not.toBe('no_contact');
    expect(result.standing).not.toBe('falling_behind');
  });

  /**
   * Rule 3. A class with no recording, or a recap nobody published, makes an
   * item the student cannot clear. Counting it against them chases somebody for
   * our own gap.
   */
  it('never pushes a student down for work that is blocked on us', () => {
    const blocked = { ownOpen: 0, blockedOnUs: 4 };
    expect(standingOf({ catchup: blocked })).toBe('keeping_up');
    expect(
      standingOf({
        catchup: blocked,
        attendance: { counted: 10, present: 2, away: 0, unexplainedMissed: 8 },
        seen: { lastSeenAt: null, neverEntered: true },
      }),
    ).toBe('catching_up');
  });

  it('reports blocked work as ours, in words', () => {
    const result = attendanceStanding(input({ catchup: { ownOpen: 0, blockedOnUs: 2 } }));
    expect(result.reasons.join(' ')).toMatch(/waiting on a recap from us/i);
  });

  it('carries a failed catch-up read as unavailable, not as an empty backlog', () => {
    const result = attendanceStanding(input({ catchup: null }));
    expect(result.unavailable).toContain('catch-up');
  });
});

describe('precedence', () => {
  it('holds a recent joiner back from every verdict', () => {
    expect(
      standingOf({
        enrolledAt: '2026-09-25T00:00:00Z',
        attendance: { counted: 4, present: 0, away: 0, unexplainedMissed: 4 },
        catchup: { ownOpen: 4, blockedOnUs: 0 },
        seen: { lastSeenAt: null, neverEntered: true },
      }),
    ).toBe('new');
  });

  /**
   * The placement that matters most. Declaring a window IS contact, so a student
   * who told us they would be gone must never be the one this screen points at.
   * If away lost to no_contact, the feature would punish exactly the people who
   * used it as intended.
   */
  it('puts a declared window ahead of no contact', () => {
    expect(
      standingOf({
        away: { endsOn: '2026-10-20', reviewOverdue: false },
        attendance: { counted: 10, present: 0, away: 10, unexplainedMissed: 0 },
        catchup: { ownOpen: 6, blockedOnUs: 0 },
        seen: { lastSeenAt: null, neverEntered: true },
      }),
    ).toBe('away');
  });

  it('puts no contact ahead of falling behind', () => {
    expect(
      standingOf({
        attendance: { counted: 10, present: 2, away: 0, unexplainedMissed: 8 },
        catchup: { ownOpen: 5, blockedOnUs: 0 },
        seen: { lastSeenAt: null, neverEntered: true },
      }),
    ).toBe('no_contact');
  });
});

describe('the standings themselves', () => {
  it('calls a student in the room and up to date keeping up', () => {
    expect(standingOf()).toBe('keeping_up');
  });

  /**
   * The distinction the whole screen is for: identical rows of absences, one of
   * them fine.
   */
  it('calls a student who misses live but clears everything catching up', () => {
    expect(
      standingOf({
        attendance: { counted: 10, present: 3, away: 0, unexplainedMissed: 7 },
        catchup: { ownOpen: 0, blockedOnUs: 0 },
      }),
    ).toBe('catching_up');
  });

  it('calls the same student falling behind when the work is not done', () => {
    expect(
      standingOf({
        attendance: { counted: 10, present: 3, away: 0, unexplainedMissed: 7 },
        catchup: { ownOpen: 7, blockedOnUs: 0 },
      }),
    ).toBe('falling_behind');
  });

  it('does not call somebody no contact while they are still opening Nexus', () => {
    expect(
      standingOf({
        attendance: { counted: 10, present: 2, away: 0, unexplainedMissed: 8 },
        catchup: { ownOpen: 5, blockedOnUs: 0 },
        seen: { lastSeenAt: '2026-09-29T00:00:00Z', neverEntered: false },
      }),
    ).toBe('falling_behind');
  });

  it('turns to no contact once they have been unseen long enough', () => {
    const daysAgo = (n: number) =>
      new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString();
    const args = {
      attendance: { counted: 10, present: 2, away: 0, unexplainedMissed: 8 },
      catchup: { ownOpen: 5, blockedOnUs: 0 },
    };
    expect(standingOf({ ...args, seen: { lastSeenAt: daysAgo(10), neverEntered: false } })).toBe(
      'falling_behind',
    );
    expect(
      standingOf({ ...args, seen: { lastSeenAt: daysAgo(NO_CONTACT_DAYS + 1), neverEntered: false } }),
    ).toBe('no_contact');
  });

  it('needs something unexplained before it says no contact', () => {
    // Everything they missed was explained, so silence is not evidence.
    expect(
      standingOf({
        attendance: { counted: 10, present: 2, away: 0, unexplainedMissed: 0 },
        catchup: { ownOpen: 5, blockedOnUs: 0 },
        seen: { lastSeenAt: null, neverEntered: true },
      }),
    ).toBe('falling_behind');
  });

  it('draws the keeping up line at the stated rate, not near it', () => {
    const at = (present: number) =>
      standingOf({ attendance: { counted: 100, present, away: 0, unexplainedMissed: 100 - present } });
    expect(at(KEEPING_UP_RATE)).toBe('keeping_up');
    expect(at(KEEPING_UP_RATE - 1)).toBe('catching_up');
  });
});

describe('the open-ended safety valve', () => {
  /**
   * An open-ended window explains every future class forever. Without this the
   * student would drop off every human-facing list permanently, which is
   * dormancy's failure mode arriving through a nicer door.
   */
  it('surfaces an away window nobody has confirmed in a month', () => {
    const result = attendanceStanding(
      input({ away: { endsOn: null, reviewOverdue: true } }),
    );
    expect(result.standing).toBe('away');
    expect(result.reasons[0]).toMatch(/not been confirmed in a month/i);
  });

  it('leaves a fresh window quiet', () => {
    const result = attendanceStanding(input({ away: { endsOn: '2026-10-20', reviewOverdue: false } }));
    expect(result.standing).toBe('away');
    expect(result.reasons.join(' ')).not.toMatch(/confirmed/i);
  });
});

describe('the display tables', () => {
  it('cover every standing exactly once', () => {
    const all = Object.keys(STANDING_META).sort();
    expect([...STANDING_ORDER].sort()).toEqual(all);
    expect(STANDING_ORDER.length).toBe(new Set(STANDING_ORDER).size);
  });

  it('put the ones needing a person first', () => {
    expect(STANDING_ORDER[0]).toBe('no_contact');
    expect(STANDING_ORDER[1]).toBe('falling_behind');
  });
});
