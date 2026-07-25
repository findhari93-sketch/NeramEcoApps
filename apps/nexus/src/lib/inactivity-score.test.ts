import { describe, it, expect } from 'vitest';
import { scoreInactivity, NEW_JOINER_GRACE_DAYS, type InactivitySignals } from './inactivity-score';

const TODAY = '2026-07-25T00:00:00.000Z';

/** N days before TODAY, as an ISO timestamp. */
function daysAgo(n: number): string {
  return new Date(Date.parse(TODAY) - n * 86_400_000).toISOString();
}

/** A perfectly engaged, long-enrolled student. Each test degrades one signal. */
function clean(overrides: Partial<InactivitySignals> = {}): InactivitySignals {
  return {
    enrolledAt: daysAgo(120),
    today: TODAY,
    assignments: { applicable: 10, submitted: 9, daysSinceLast: 2 },
    absences: { noShows: 0, classesMeasured: 12 },
    login: { firstLoginAt: daysAgo(110), lastLoginAt: daysAgo(1) },
    photoStatus: 'approved',
    ...overrides,
  };
}

describe('new joiner grace period', () => {
  it('returns tier new and score 0 even when every other signal is terrible', () => {
    const r = scoreInactivity({
      enrolledAt: daysAgo(3),
      today: TODAY,
      assignments: { applicable: 5, submitted: 0, daysSinceLast: null },
      absences: { noShows: 5, classesMeasured: 5 },
      login: { firstLoginAt: null, lastLoginAt: null },
      photoStatus: 'missing',
    });
    expect(r.tier).toBe('new');
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual(['Joined recently']);
    expect(r.neverEngaged).toBe(false);
  });

  it('applies the full rules the day the grace period ends', () => {
    const inside = scoreInactivity(
      clean({ enrolledAt: daysAgo(NEW_JOINER_GRACE_DAYS - 1), photoStatus: 'missing' }),
    );
    const outside = scoreInactivity(
      clean({ enrolledAt: daysAgo(NEW_JOINER_GRACE_DAYS), photoStatus: 'missing' }),
    );
    expect(inside.tier).toBe('new');
    expect(outside.tier).not.toBe('new');
  });

  it('still reports attendance as unavailable during the grace period', () => {
    const r = scoreInactivity(clean({ enrolledAt: daysAgo(3), absences: null }));
    expect(r.unavailable).toContain('attendance');
  });
});

describe('neverEngaged', () => {
  it('forces critical when the student never logged in and never submitted', () => {
    const r = scoreInactivity(
      clean({
        assignments: { applicable: 1, submitted: 0, daysSinceLast: null },
        login: { firstLoginAt: null, lastLoginAt: null },
      }),
    );
    expect(r.neverEngaged).toBe(true);
    expect(r.tier).toBe('critical');
  });

  it('is false when the student has logged in, however long ago', () => {
    const r = scoreInactivity(
      clean({
        assignments: { applicable: 5, submitted: 0, daysSinceLast: null },
        login: { firstLoginAt: daysAgo(90), lastLoginAt: daysAgo(90) },
      }),
    );
    expect(r.neverEngaged).toBe(false);
  });
});

describe('unmeasured attendance', () => {
  it('adds zero points and reports attendance as unavailable', () => {
    const withData = scoreInactivity(clean({ absences: { noShows: 0, classesMeasured: 12 } }));
    const without = scoreInactivity(clean({ absences: null }));
    expect(without.score).toBe(withData.score);
    expect(without.unavailable).toEqual(['attendance']);
    expect(withData.unavailable).toEqual([]);
  });

  it('never emits a missed-class reason when attendance was not measured', () => {
    const r = scoreInactivity(clean({ absences: null }));
    expect(r.reasons.some((x) => x.toLowerCase().includes('miss'))).toBe(false);
  });
});

describe('absence bands', () => {
  it('a tiny denominator only reaches the flat band, never the ratio bands', () => {
    // 2 of 2 missed is 100 percent, but 2 classes is not a pattern.
    const r = scoreInactivity(clean({ absences: { noShows: 2, classesMeasured: 2 } }));
    expect(r.reasons).toContain('Missed some classes');
    expect(r.reasons).not.toContain('Missed almost every class');
    expect(r.reasons).not.toContain('Missed half the classes');
    expect(r.score).toBe(1);
  });

  it('scores the half band at 4 measured classes', () => {
    const r = scoreInactivity(clean({ absences: { noShows: 2, classesMeasured: 4 } }));
    expect(r.reasons).toContain('Missed half the classes');
    expect(r.score).toBe(2);
  });

  it('scores the worst band at 75 percent or more', () => {
    const r = scoreInactivity(clean({ absences: { noShows: 3, classesMeasured: 4 } }));
    expect(r.reasons).toContain('Missed almost every class');
    expect(r.score).toBe(3);
  });

  it('one missed class out of many is not worth flagging', () => {
    const r = scoreInactivity(clean({ absences: { noShows: 1, classesMeasured: 12 } }));
    expect(r.score).toBe(0);
    expect(r.tier).toBe('ok');
  });
});

describe('assignment bands', () => {
  it('scores 3 for never having submitted anything', () => {
    const r = scoreInactivity(
      clean({ assignments: { applicable: 4, submitted: 0, daysSinceLast: null } }),
    );
    expect(r.reasons).toContain('No assignment ever submitted');
    expect(r.score).toBe(3);
  });

  it('does not fire the never-submitted band with only one applicable assignment', () => {
    const r = scoreInactivity(
      clean({ assignments: { applicable: 1, submitted: 0, daysSinceLast: null } }),
    );
    expect(r.reasons).not.toContain('No assignment ever submitted');
    expect(r.score).toBe(0);
  });

  it('uses the 14 and 21 day boundaries exclusively', () => {
    const at14 = scoreInactivity(clean({ assignments: { applicable: 5, submitted: 3, daysSinceLast: 14 } }));
    const at15 = scoreInactivity(clean({ assignments: { applicable: 5, submitted: 3, daysSinceLast: 15 } }));
    const at21 = scoreInactivity(clean({ assignments: { applicable: 5, submitted: 3, daysSinceLast: 21 } }));
    const at22 = scoreInactivity(clean({ assignments: { applicable: 5, submitted: 3, daysSinceLast: 22 } }));
    expect(at14.score).toBe(0);
    expect(at15.score).toBe(1);
    expect(at21.score).toBe(1);
    expect(at22.score).toBe(2);
  });

  it('scores nothing when the classroom has no published work', () => {
    const r = scoreInactivity(clean({ assignments: null }));
    expect(r.reasons.some((x) => x.toLowerCase().includes('assignment'))).toBe(false);
  });
});

describe('login bands', () => {
  it('uses the 14 and 21 day boundaries exclusively', () => {
    const at14 = scoreInactivity(clean({ login: { firstLoginAt: daysAgo(90), lastLoginAt: daysAgo(14) } }));
    const at15 = scoreInactivity(clean({ login: { firstLoginAt: daysAgo(90), lastLoginAt: daysAgo(15) } }));
    const at21 = scoreInactivity(clean({ login: { firstLoginAt: daysAgo(90), lastLoginAt: daysAgo(21) } }));
    const at22 = scoreInactivity(clean({ login: { firstLoginAt: daysAgo(90), lastLoginAt: daysAgo(22) } }));
    expect(at14.score).toBe(0);
    expect(at15.score).toBe(1);
    expect(at21.score).toBe(1);
    expect(at22.score).toBe(2);
  });
});

describe('photo signal', () => {
  it('adds one point for a missing photo only', () => {
    expect(scoreInactivity(clean({ photoStatus: 'missing' })).score).toBe(1);
    expect(scoreInactivity(clean({ photoStatus: 'pending' })).score).toBe(0);
    expect(scoreInactivity(clean({ photoStatus: 'rejected' })).score).toBe(0);
    expect(scoreInactivity(clean({ photoStatus: 'approved' })).score).toBe(0);
  });
});

describe('tier boundaries', () => {
  const cases: [number, string][] = [
    [0, 'ok'],
    [1, 'nudge'],
    [2, 'nudge'],
    [3, 'watch'],
    [5, 'watch'],
    [6, 'critical'],
  ];

  it.each(cases)('score %i maps to tier %s', (target, tier) => {
    // Build the target score out of independent axes so no band double-counts.
    const photo = target >= 1 ? 'missing' : 'approved';
    const afterPhoto = target - (photo === 'missing' ? 1 : 0);
    // Remaining points come from assignments (max 3) then absences (max 3).
    const assignPts = Math.min(afterPhoto, 3);
    const absencePts = afterPhoto - assignPts;

    const r = scoreInactivity(
      clean({
        photoStatus: photo,
        assignments:
          assignPts === 3
            ? { applicable: 4, submitted: 0, daysSinceLast: null }
            : assignPts === 2
              ? { applicable: 5, submitted: 3, daysSinceLast: 30 }
              : assignPts === 1
                ? { applicable: 5, submitted: 3, daysSinceLast: 15 }
                : { applicable: 5, submitted: 5, daysSinceLast: 1 },
        absences:
          absencePts === 3
            ? { noShows: 4, classesMeasured: 4 }
            : absencePts === 2
              ? { noShows: 2, classesMeasured: 4 }
              : absencePts === 1
                ? { noShows: 2, classesMeasured: 12 }
                : { noShows: 0, classesMeasured: 12 },
      }),
    );
    expect(r.score).toBe(target);
    expect(r.tier).toBe(tier);
  });
});

describe('content rules', () => {
  it('no reason string contains an em dash or a double dash', () => {
    // Drive the function through every band and collect every string it emits.
    const all = new Set<string>();
    const variants: Partial<InactivitySignals>[] = [
      { enrolledAt: daysAgo(2) },
      { assignments: { applicable: 4, submitted: 0, daysSinceLast: null } },
      { assignments: { applicable: 5, submitted: 3, daysSinceLast: 30 } },
      { assignments: { applicable: 5, submitted: 3, daysSinceLast: 15 } },
      { absences: { noShows: 4, classesMeasured: 4 } },
      { absences: { noShows: 2, classesMeasured: 4 } },
      { absences: { noShows: 2, classesMeasured: 12 } },
      { login: { firstLoginAt: null, lastLoginAt: null } },
      { login: { firstLoginAt: daysAgo(90), lastLoginAt: daysAgo(30) } },
      { login: { firstLoginAt: daysAgo(90), lastLoginAt: daysAgo(16) } },
      { photoStatus: 'missing' },
    ];
    for (const v of variants) {
      scoreInactivity(clean(v)).reasons.forEach((r) => all.add(r));
    }
    expect(all.size).toBeGreaterThan(8);
    for (const reason of all) {
      expect(reason).not.toMatch(/—|--|&mdash;/);
    }
  });
});
