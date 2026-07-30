import { describe, it, expect } from 'vitest';
import {
  SMALL_CLASS_FLOOR,
  eligibleAtDate,
  buildAnonymousAggregate,
  describeAggregate,
  type AggregateMember,
} from './parent-aggregate';

const CLASS_DATE = '2026-07-20';

function member(id: string, enrolledAt: string | null = '2026-06-01T00:00:00Z'): AggregateMember {
  return { user_id: id, enrolled_at: enrolledAt };
}

/** A roster of `n` students, all enrolled long before CLASS_DATE. */
function roster(n: number): AggregateMember[] {
  return Array.from({ length: n }, (_, i) => member(`s${i + 1}`));
}

describe('eligibleAtDate', () => {
  it('keeps a student who enrolled well before the class', () => {
    expect(eligibleAtDate([member('s1', '2026-06-01T00:00:00Z')], CLASS_DATE)).toEqual(['s1']);
  });

  it('drops a student who enrolled the day after the class', () => {
    // Never had the chance to do it, so counting them would understate the class.
    expect(eligibleAtDate([member('s1', '2026-07-21T04:00:00Z')], CLASS_DATE)).toEqual([]);
  });

  it('keeps a student who enrolled at the last IST instant of the class day', () => {
    // 2026-07-20T23:59:59+05:30 is 18:29:59Z. The boundary is inclusive, and it
    // is IST, matching roster.ts endOfDayIst exactly.
    expect(eligibleAtDate([member('s1', '2026-07-20T18:29:59Z')], CLASS_DATE)).toEqual(['s1']);
  });

  it('drops a student who enrolled one second after the IST end of day', () => {
    expect(eligibleAtDate([member('s1', '2026-07-20T18:30:01Z')], CLASS_DATE)).toEqual([]);
  });

  it('does not treat a late-evening IST enrolment as the next UTC day', () => {
    // 2026-07-20 23:00 IST is 17:30Z the same day. A naive UTC comparison against
    // a bare date would still pass here, but against the previous day it would
    // not. Pinning the IST boundary is what makes this stable.
    expect(eligibleAtDate([member('s1', '2026-07-20T17:30:00Z')], CLASS_DATE)).toEqual(['s1']);
  });

  it('counts a student with no enrolment timestamp rather than guessing', () => {
    expect(eligibleAtDate([member('s1', null)], CLASS_DATE)).toEqual(['s1']);
  });

  it('counts a student whose enrolment timestamp is unparseable', () => {
    expect(eligibleAtDate([member('s1', 'not a date')], CLASS_DATE)).toEqual(['s1']);
  });

  it('returns everyone when no date is supplied', () => {
    expect(eligibleAtDate(roster(3), null)).toHaveLength(3);
  });

  it('handles an empty roster', () => {
    expect(eligibleAtDate([], CLASS_DATE)).toEqual([]);
  });
});

describe('buildAnonymousAggregate', () => {
  it('counts submitters that are on the roster', () => {
    const result = buildAnonymousAggregate({
      eligibleIds: ['s1', 's2', 's3', 's4', 's5'],
      submitterIds: ['s1', 's2', 's3'],
    });
    expect(result).toEqual({ submitted: 3, of: 5 });
  });

  it('counts a student once even when they appear twice in the submitter list', () => {
    // The caller unions the document and drawing submission tables, so the same
    // student can legitimately arrive twice.
    const result = buildAnonymousAggregate({
      eligibleIds: roster(6).map((m) => m.user_id),
      submitterIds: ['s1', 's1', 's2'],
    });
    expect(result).toEqual({ submitted: 2, of: 6 });
  });

  it('ignores a submitter who is not on the roster', () => {
    // A dormant, graduated or departed student's submission row is real, but
    // they are not in the denominator. Counting it would print "6 of 5".
    const result = buildAnonymousAggregate({
      eligibleIds: ['s1', 's2', 's3', 's4', 's5'],
      submitterIds: ['s1', 's2', 'ghost', 'alumni'],
    });
    expect(result).toEqual({ submitted: 2, of: 5 });
  });

  it('never reports more submitted than eligible', () => {
    const result = buildAnonymousAggregate({
      eligibleIds: roster(5).map((m) => m.user_id),
      submitterIds: roster(5).map((m) => m.user_id),
    });
    expect(result!.submitted).toBeLessThanOrEqual(result!.of);
    expect(result).toEqual({ submitted: 5, of: 5 });
  });

  it('reports zero submitters honestly rather than hiding the row', () => {
    expect(
      buildAnonymousAggregate({ eligibleIds: roster(8).map((m) => m.user_id), submitterIds: [] })
    ).toEqual({ submitted: 0, of: 8 });
  });

  it('accepts Sets as well as arrays', () => {
    const result = buildAnonymousAggregate({
      eligibleIds: new Set(['s1', 's2', 's3', 's4', 's5']),
      submitterIds: new Set(['s1']),
    });
    expect(result).toEqual({ submitted: 1, of: 5 });
  });
});

describe('the privacy floor', () => {
  it('is 5', () => {
    expect(SMALL_CLASS_FLOOR).toBe(5);
  });

  it('publishes nothing at 4 eligible students', () => {
    expect(
      buildAnonymousAggregate({
        eligibleIds: roster(4).map((m) => m.user_id),
        submitterIds: ['s1'],
      })
    ).toBeNull();
  });

  it('publishes at 5 eligible students', () => {
    expect(
      buildAnonymousAggregate({
        eligibleIds: roster(5).map((m) => m.user_id),
        submitterIds: ['s1'],
      })
    ).toEqual({ submitted: 1, of: 5 });
  });

  it('publishes nothing for the two-student case, which is fully identifying', () => {
    // With of=2, a parent who knows their own child's status knows the other
    // child's exactly. This is the case the floor exists for.
    expect(
      buildAnonymousAggregate({ eligibleIds: ['mine', 'theirs'], submitterIds: ['mine'] })
    ).toBeNull();
  });

  it('publishes nothing for an empty roster', () => {
    expect(buildAnonymousAggregate({ eligibleIds: [], submitterIds: [] })).toBeNull();
  });
});

describe('describeAggregate', () => {
  const BANNED = /[—–]|--|&mdash;/;

  it('explains the suppressed case instead of showing a count', () => {
    const text = describeAggregate(null);
    expect(text).toContain('very small groups');
    expect(text).not.toMatch(/\d/);
  });

  it('never renders "0 of 0"', () => {
    expect(describeAggregate(null)).not.toContain('0 of 0');
  });

  it('words the zero case without sounding like a failure', () => {
    expect(describeAggregate({ submitted: 0, of: 9 })).toBe(
      'Nobody in the class has handed this in yet.'
    );
  });

  it('words the everyone case', () => {
    expect(describeAggregate({ submitted: 9, of: 9 })).toBe(
      'Everyone in the class has handed this in.'
    );
  });

  it('words the partial case', () => {
    expect(describeAggregate({ submitted: 4, of: 9 })).toBe(
      '4 of 9 in the class have handed this in.'
    );
  });

  it('switches verb for tests', () => {
    expect(describeAggregate({ submitted: 4, of: 9 }, 'attempted')).toBe(
      '4 of 9 in the class have attempted this.'
    );
  });

  it.each([
    ['suppressed', null],
    ['zero', { submitted: 0, of: 9 }],
    ['partial', { submitted: 4, of: 9 }],
    ['complete', { submitted: 9, of: 9 }],
  ] as const)('uses no em dashes in the %s sentence', (_name, agg) => {
    expect(describeAggregate(agg)).not.toMatch(BANNED);
    expect(describeAggregate(agg, 'attempted')).not.toMatch(BANNED);
  });
});

describe('the shape never widens', () => {
  it('emits exactly two keys, so no identifying field can ride along', () => {
    const result = buildAnonymousAggregate({
      eligibleIds: roster(6).map((m) => m.user_id),
      submitterIds: ['s1', 's2'],
    });
    expect(Object.keys(result!).sort()).toEqual(['of', 'submitted']);
  });

  it('carries no student ids in the output', () => {
    const result = buildAnonymousAggregate({
      eligibleIds: ['alice', 'bob', 'carol', 'dave', 'erin'],
      submitterIds: ['alice'],
    });
    expect(JSON.stringify(result)).not.toMatch(/alice|bob|carol|dave|erin/);
  });
});
