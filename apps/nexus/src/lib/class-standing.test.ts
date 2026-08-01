import { describe, it, expect } from 'vitest';
import {
  BAND_COLOR,
  CLASS_STANDING_GRACE_DAYS,
  STANDING_WEIGHTS,
  computeClassStanding,
  toLegacyVerdictBand,
  type ClassStandingSignals,
} from './class-standing';
import { scoreInactivity } from './inactivity-score';

const TODAY = '2026-08-01';
/** Well past the grace period, so the full rules apply. */
const ENROLLED = '2026-01-01';

function signals(over: Partial<ClassStandingSignals> = {}): ClassStandingSignals {
  return {
    enrolledAt: ENROLLED,
    today: TODAY,
    windowDays: 90,
    attendance: { measuredClasses: 10, attended: 10, excusedByTeacher: 0, selfExplained: 0 },
    assignments: { applicable: 10, submitted: 10, onTime: 10, avgMarksPct: 90 },
    tests: { total: 5, attempted: 5, averageBestPct: 100 },
    catchup: { total: 4, done: 4, excused: 0 },
    punctuality: { attendedClasses: 10, cleanClasses: 10 },
    ...over,
  };
}

describe('the weights are a closed system', () => {
  it('nominal weights total exactly 100', () => {
    const total = Object.values(STANDING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('there are exactly five components and every band has a colour', () => {
    expect(Object.keys(STANDING_WEIGHTS)).toHaveLength(5);
    for (const band of [
      'excelling',
      'on_track',
      'needs_support',
      'at_risk',
      'settling_in',
      'not_enough_data',
    ] as const) {
      expect(BAND_COLOR[band]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('the full range', () => {
  it('everything perfect gives 100 and Excelling', () => {
    const r = computeClassStanding(signals());
    expect(r.score).toBe(100);
    expect(r.band).toBe('excelling');
    expect(r.unavailable).toEqual([]);
  });

  it('everything at zero gives 0 and At Risk', () => {
    const r = computeClassStanding(
      signals({
        attendance: { measuredClasses: 10, attended: 0, excusedByTeacher: 0, selfExplained: 0 },
        assignments: { applicable: 10, submitted: 0, onTime: 0, avgMarksPct: null },
        tests: { total: 5, attempted: 0, averageBestPct: null },
        catchup: { total: 4, done: 0, excused: 0 },
        punctuality: { attendedClasses: 10, cleanClasses: 0 },
      }),
    );
    expect(r.score).toBe(0);
    expect(r.band).toBe('at_risk');
  });

  it('a score is never outside 0 to 100 even with impossible inputs', () => {
    const r = computeClassStanding(
      signals({
        // More submitted than applicable, more attended than measured.
        attendance: { measuredClasses: 5, attended: 50, excusedByTeacher: 0, selfExplained: 0 },
        assignments: { applicable: 2, submitted: 40, onTime: 40, avgMarksPct: 100 },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('band boundaries are inclusive at the threshold', () => {
  /** Drive the total to an exact value using one measured component. */
  function only(score: number) {
    return computeClassStanding(
      signals({
        attendance: {
          measuredClasses: 100,
          attended: score,
          excusedByTeacher: 0,
          selfExplained: 0,
        },
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
  }

  it('85 is Excelling and 84 is On Track', () => {
    expect(only(85).band).toBe('excelling');
    expect(only(84).band).toBe('on_track');
  });

  it('70 is On Track and 69 is Needs Support', () => {
    expect(only(70).band).toBe('on_track');
    expect(only(69).band).toBe('needs_support');
  });

  it('50 is Needs Support and 49 is At Risk', () => {
    expect(only(50).band).toBe('needs_support');
    expect(only(49).band).toBe('at_risk');
  });
});

describe('a null NEVER contributes zero', () => {
  // This block is the reason the module exists in this shape. If any of it
  // fails, students are being marked down for our infrastructure failing.

  it('one measured component at 100 scores 100, not its raw weight', () => {
    const r = computeClassStanding(
      signals({
        attendance: null,
        assignments: { applicable: 4, submitted: 4, onTime: 4, avgMarksPct: null },
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    // Naive weighting would give 25. Renormalised, assignments carry the whole
    // number, so a student doing everything asked of them scores 100.
    expect(r.score).toBe(100);
    expect(r.band).toBe('excelling');
  });

  it('unmeasured attendance renormalises the remaining weight to 100', () => {
    const withAttendance = computeClassStanding(signals());
    const without = computeClassStanding(signals({ attendance: null }));

    // Every measured component is at 100 in both, so removing one must not
    // change the total.
    expect(withAttendance.score).toBe(100);
    expect(without.score).toBe(100);
    expect(without.unavailable).toEqual(['attendance']);

    const attendance = without.components.find((c) => c.key === 'attendance')!;
    expect(attendance.measured).toBe(false);
    expect(attendance.effectiveWeight).toBe(0);
    expect(attendance.contribution).toBeNull();
    expect(attendance.score).toBeNull();
  });

  it('effective weights of the measured components total about 100', () => {
    const r = computeClassStanding(signals({ attendance: null, tests: null }));
    const sum = r.components
      .filter((c) => c.measured)
      .reduce((acc, c) => acc + c.effectiveWeight, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(2); // rounding only
  });

  it('contributions add up to the score', () => {
    const r = computeClassStanding(
      signals({
        attendance: { measuredClasses: 10, attended: 8, excusedByTeacher: 0, selfExplained: 0 },
        assignments: { applicable: 10, submitted: 7, onTime: 5, avgMarksPct: 60 },
        tests: { total: 4, attempted: 3, averageBestPct: 72 },
        catchup: { total: 3, done: 2, excused: 0 },
        punctuality: { attendedClasses: 8, cleanClasses: 6 },
      }),
    );
    const sum = r.components.reduce((acc, c) => acc + (c.contribution ?? 0), 0);
    expect(Math.abs(sum - (r.score as number))).toBeLessThanOrEqual(2);
  });

  it('every component null gives not_enough_data, never 0', () => {
    const r = computeClassStanding(
      signals({
        attendance: null,
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    expect(r.score).toBeNull();
    expect(r.band).toBe('not_enough_data');
  });
});

describe('the evidence floor and the grace period', () => {
  it('a student enrolled three days ago is Settling In whatever the signals', () => {
    const r = computeClassStanding(
      signals({
        enrolledAt: '2026-07-29',
        attendance: { measuredClasses: 10, attended: 0, excusedByTeacher: 0, selfExplained: 0 },
        assignments: { applicable: 10, submitted: 0, onTime: 0, avgMarksPct: null },
      }),
    );
    expect(r.score).toBeNull();
    expect(r.band).toBe('settling_in');
  });

  it('the grace period ends exactly at the constant', () => {
    const dayBefore = new Date(
      Date.parse(`${TODAY}T00:00:00Z`) - (CLASS_STANDING_GRACE_DAYS - 1) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    const dayAfter = new Date(
      Date.parse(`${TODAY}T00:00:00Z`) - CLASS_STANDING_GRACE_DAYS * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);

    expect(computeClassStanding(signals({ enrolledAt: dayBefore })).band).toBe('settling_in');
    expect(computeClassStanding(signals({ enrolledAt: dayAfter })).band).not.toBe('settling_in');
  });

  it('one measured class and no assignments is not enough to judge', () => {
    const r = computeClassStanding(
      signals({
        attendance: { measuredClasses: 1, attended: 0, excusedByTeacher: 0, selfExplained: 0 },
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    expect(r.score).toBeNull();
    expect(r.band).toBe('not_enough_data');
  });

  it('a null enrolledAt does not trigger the grace period', () => {
    const r = computeClassStanding(signals({ enrolledAt: null }));
    expect(r.band).toBe('excelling');
  });
});

describe('attendance treats excused and explained absences differently', () => {
  it('a teacher-excused absence leaves the denominator entirely', () => {
    // 10 measured, 2 excused by a teacher, 8 attended: that is a full house.
    const r = computeClassStanding(
      signals({
        attendance: { measuredClasses: 10, attended: 8, excusedByTeacher: 2, selfExplained: 0 },
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    expect(r.score).toBe(100);
  });

  it('a self-declared reason earns half credit, not a free pass', () => {
    const explained = computeClassStanding(
      signals({
        attendance: { measuredClasses: 10, attended: 8, excusedByTeacher: 0, selfExplained: 2 },
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    const silent = computeClassStanding(
      signals({
        attendance: { measuredClasses: 10, attended: 8, excusedByTeacher: 0, selfExplained: 0 },
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    expect(explained.score).toBe(90); // (8 + 1) / 10
    expect(silent.score).toBe(80);
    expect(explained.score!).toBeGreaterThan(silent.score!);
    expect(explained.score!).toBeLessThan(100);
  });

  it('all absences excused makes attendance unmeasurable rather than perfect', () => {
    const r = computeClassStanding(
      signals({
        attendance: { measuredClasses: 3, attended: 0, excusedByTeacher: 3, selfExplained: 0 },
      }),
    );
    expect(r.unavailable).toContain('attendance');
  });
});

describe('catch-up is null when nothing is owed, never 100', () => {
  it('a student who missed nothing has no catch-up component', () => {
    // Awarding 100 here would count perfect attendance twice.
    const r = computeClassStanding(signals({ catchup: { total: 0, done: 0, excused: 0 } }));
    expect(r.unavailable).toContain('catchup');
    const c = r.components.find((x) => x.key === 'catchup')!;
    expect(c.score).toBeNull();
  });

  it('excused missed classes are removed from what is owed', () => {
    // Asserted on the component, not the total: catch-up alone is thin evidence
    // and correctly trips the not_enough_data floor, so the surrounding signals
    // stay measured to keep this test about the arithmetic it names.
    const r = computeClassStanding(signals({ catchup: { total: 5, done: 2, excused: 3 } }));
    const c = r.components.find((x) => x.key === 'catchup')!;
    expect(c.score).toBe(100); // 2 done of the 2 actually owed
    expect(c.evidence).toContain('2 of 2');
  });

  it('an unexcused backlog does pull the component down', () => {
    const r = computeClassStanding(signals({ catchup: { total: 5, done: 2, excused: 0 } }));
    const c = r.components.find((x) => x.key === 'catchup')!;
    expect(c.score).toBe(40); // 2 of 5
  });
});

describe('the evidence floor refuses to judge on one thin signal', () => {
  it('catch-up alone is not enough to give a student a number', () => {
    // Catch-up says nothing about a student who never missed a class, so it
    // cannot carry a whole standing on its own.
    const r = computeClassStanding(
      signals({
        attendance: null,
        assignments: null,
        tests: null,
        punctuality: null,
        catchup: { total: 5, done: 2, excused: 0 },
      }),
    );
    expect(r.score).toBeNull();
    expect(r.band).toBe('not_enough_data');
  });

  it('enough attendance alone clears the floor', () => {
    const r = computeClassStanding(
      signals({
        attendance: { measuredClasses: 6, attended: 5, excusedByTeacher: 0, selfExplained: 0 },
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    expect(r.score).toBe(83);
    expect(r.band).toBe('on_track');
  });

  it('one outstanding assignment never brands a student At Risk', () => {
    // The exact shape found against real data: a classroom with no attendance
    // synced, no tests set, nothing to catch up, and a single assignment the
    // student has not handed in. The first version scored this 0 and said
    // "Falling behind on several fronts. Worth contacting the family", which is
    // a phone call to a family over one piece of homework.
    const r = computeClassStanding(
      signals({
        attendance: null,
        tests: null,
        catchup: null,
        punctuality: null,
        assignments: { applicable: 1, submitted: 0, onTime: 0, avgMarksPct: null },
      }),
    );
    expect(r.score).toBeNull();
    expect(r.band).toBe('not_enough_data');
    expect(r.band).not.toBe('at_risk');
  });

  it('two missed assignments is still an incident, not a pattern', () => {
    const r = computeClassStanding(
      signals({
        attendance: null,
        tests: null,
        catchup: null,
        punctuality: null,
        assignments: { applicable: 2, submitted: 0, onTime: 0, avgMarksPct: null },
      }),
    );
    expect(r.band).toBe('not_enough_data');
  });

  it('three tells the truth, because by then it is a pattern', () => {
    const r = computeClassStanding(
      signals({
        attendance: null,
        tests: null,
        catchup: null,
        punctuality: null,
        assignments: { applicable: 3, submitted: 0, onTime: 0, avgMarksPct: null },
      }),
    );
    expect(r.score).toBe(0);
    expect(r.band).toBe('at_risk');
  });

  it('two measured classes is below the floor, three is not', () => {
    const thin = computeClassStanding(
      signals({
        attendance: { measuredClasses: 2, attended: 0, excusedByTeacher: 0, selfExplained: 0 },
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    expect(thin.band).toBe('not_enough_data');

    const enough = computeClassStanding(
      signals({
        attendance: { measuredClasses: 3, attended: 0, excusedByTeacher: 0, selfExplained: 0 },
        assignments: null,
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    expect(enough.score).toBe(0);
  });

  it('enough assignments alone clears the floor', () => {
    const r = computeClassStanding(
      signals({
        attendance: null,
        assignments: { applicable: 4, submitted: 4, onTime: 2, avgMarksPct: null },
        tests: null,
        catchup: null,
        punctuality: null,
      }),
    );
    expect(r.score).not.toBeNull();
    expect(r.band).not.toBe('not_enough_data');
  });
});

describe('assignment marks are reported but never scored', () => {
  it('a pile of unmarked work does not lower the score', () => {
    const unmarked = computeClassStanding(
      signals({ assignments: { applicable: 10, submitted: 10, onTime: 10, avgMarksPct: null } }),
    );
    const marked = computeClassStanding(
      signals({ assignments: { applicable: 10, submitted: 10, onTime: 10, avgMarksPct: 95 } }),
    );
    // A student must not look weak because their work sits in a grading queue.
    expect(unmarked.score).toBe(marked.score);
  });
});

describe('the output shape is always complete', () => {
  it('components always has all five, in weight order, in every outcome', () => {
    const cases = [
      computeClassStanding(signals()),
      computeClassStanding(signals({ enrolledAt: '2026-07-30' })),
      computeClassStanding(
        signals({
          attendance: null,
          assignments: null,
          tests: null,
          catchup: null,
          punctuality: null,
        }),
      ),
    ];
    for (const r of cases) {
      expect(r.components).toHaveLength(5);
      expect(r.components.map((c) => c.key)).toEqual([
        'attendance',
        'assignments',
        'tests',
        'catchup',
        'punctuality',
      ]);
      // Even an unmeasured row must explain itself, or the reader is left
      // wondering whether it scored zero.
      for (const c of r.components) {
        expect(c.evidence.length).toBeGreaterThan(0);
        expect(c.parentEvidence.length).toBeGreaterThan(0);
      }
    }
  });

  it('shows no percentage at all when it has declined to score', () => {
    // Otherwise the panel says "not enough to go on" at the top and renders an
    // Assignments bar at 0% underneath, which reads as a judgement after all.
    for (const r of [
      computeClassStanding(signals({ enrolledAt: '2026-07-30' })),
      computeClassStanding(
        signals({
          attendance: null,
          tests: null,
          catchup: null,
          punctuality: null,
          assignments: { applicable: 1, submitted: 0, onTime: 0, avgMarksPct: null },
        }),
      ),
    ]) {
      expect(r.score).toBeNull();
      for (const c of r.components) {
        expect(c.measured, `${c.key} claims to be measured in a no-score result`).toBe(false);
        expect(c.score).toBeNull();
        expect(c.contribution).toBeNull();
        expect(c.effectiveWeight).toBe(0);
      }
    }
  });

  it('carries the injected today, so a stored result reads back honestly', () => {
    expect(computeClassStanding(signals()).computedFor).toBe(TODAY);
  });

  it('is deterministic: same input, same output', () => {
    expect(computeClassStanding(signals())).toEqual(computeClassStanding(signals()));
  });
});

describe('audience changes the words, never the number', () => {
  it('the score and band key are identical for staff and parent', () => {
    const input = signals({
      attendance: { measuredClasses: 10, attended: 4, excusedByTeacher: 0, selfExplained: 0 },
      assignments: { applicable: 10, submitted: 3, onTime: 1, avgMarksPct: 40 },
      tests: { total: 4, attempted: 1, averageBestPct: 30 },
      catchup: { total: 6, done: 1, excused: 0 },
      punctuality: { attendedClasses: 4, cleanClasses: 1 },
    });
    const staff = computeClassStanding(input, 'staff');
    const parent = computeClassStanding(input, 'parent');

    expect(parent.score).toBe(staff.score);
    expect(parent.band).toBe(staff.band);
    expect(parent.components.map((c) => c.score)).toEqual(staff.components.map((c) => c.score));
  });

  it('only At Risk is reworded for a parent', () => {
    const harsh = signals({
      attendance: { measuredClasses: 10, attended: 1, excusedByTeacher: 0, selfExplained: 0 },
      assignments: { applicable: 10, submitted: 0, onTime: 0, avgMarksPct: null },
      tests: { total: 4, attempted: 0, averageBestPct: null },
      catchup: { total: 6, done: 0, excused: 0 },
      punctuality: { attendedClasses: 1, cleanClasses: 0 },
    });
    expect(computeClassStanding(harsh, 'staff').bandLabel).toBe('At Risk');
    expect(computeClassStanding(harsh, 'parent').bandLabel).toBe('Needs Support Now');

    const good = signals();
    expect(computeClassStanding(good, 'staff').bandLabel).toBe('Excelling');
    expect(computeClassStanding(good, 'parent').bandLabel).toBe('Excelling');
  });
});

describe('there is no leaderboard anywhere in the output', () => {
  it('no output string mentions rank, percentile, average or position', () => {
    const results = [
      computeClassStanding(signals()),
      computeClassStanding(signals(), 'parent'),
      computeClassStanding(signals({ attendance: null }), 'parent'),
      computeClassStanding(signals({ enrolledAt: '2026-07-30' }), 'parent'),
    ];
    // "averaging 87%" is this student's own mean and is fine; a CLASS average,
    // a rank or a percentile is what must never appear.
    const banned = /\brank\b|\bpercentile\b|\bclass average\b|\btop \d|\bposition\b|\bout of \d+ students\b/i;
    for (const r of results) {
      const strings = [
        r.headline,
        r.detail,
        r.bandLabel,
        ...r.components.flatMap((c) => [c.label, c.evidence, c.parentEvidence]),
      ];
      for (const s of strings) {
        expect(s, `leaderboard wording found: ${s}`).not.toMatch(banned);
      }
    }
  });
});

describe('house style', () => {
  it('no user-visible string uses an em dash or a double dash', () => {
    const banned = /—|--|&mdash;/;
    const results = [
      computeClassStanding(signals()),
      computeClassStanding(signals(), 'parent'),
      computeClassStanding(signals({ attendance: null, tests: null }), 'parent'),
      computeClassStanding(signals({ enrolledAt: '2026-07-30' })),
      computeClassStanding(
        signals({
          attendance: null,
          assignments: null,
          tests: null,
          catchup: null,
          punctuality: null,
        }),
      ),
    ];
    for (const r of results) {
      const strings = [
        r.headline,
        r.detail,
        r.bandLabel,
        ...r.components.flatMap((c) => [c.label, c.evidence, c.parentEvidence]),
      ];
      for (const s of strings) {
        expect(s, `banned punctuation in: ${s}`).not.toMatch(banned);
      }
    }
  });
});

describe('agreement with the inactivity watchlist', () => {
  it('a student the watchlist calls critical is never Excelling here', () => {
    // The two scorers answer opposite questions and must not contradict. If this
    // ever fires, one of them is reading the wrong column.
    const inactivity = scoreInactivity({
      enrolledAt: ENROLLED,
      today: TODAY,
      assignments: { applicable: 10, submitted: 0, daysSinceLast: null },
      absences: { noShows: 9, classesMeasured: 10 },
      login: { firstLoginAt: null, lastLoginAt: null },
      photoStatus: 'missing',
    });
    expect(inactivity.tier).toBe('critical');

    const standing = computeClassStanding(
      signals({
        attendance: { measuredClasses: 10, attended: 1, excusedByTeacher: 0, selfExplained: 0 },
        assignments: { applicable: 10, submitted: 0, onTime: 0, avgMarksPct: null },
        tests: { total: 4, attempted: 0, averageBestPct: null },
        catchup: { total: 9, done: 0, excused: 0 },
        punctuality: { attendedClasses: 1, cleanClasses: 0 },
      }),
    );
    expect(standing.band).not.toBe('excelling');
    expect(standing.band).not.toBe('on_track');
  });
});

describe('toLegacyVerdictBand', () => {
  it('maps every band onto the parent portal vocabulary', () => {
    expect(toLegacyVerdictBand('excelling')).toBe('on_track');
    expect(toLegacyVerdictBand('on_track')).toBe('on_track');
    expect(toLegacyVerdictBand('needs_support')).toBe('slipping');
    expect(toLegacyVerdictBand('at_risk')).toBe('needs_attention');
    expect(toLegacyVerdictBand('settling_in')).toBe('not_enough_data');
    expect(toLegacyVerdictBand('not_enough_data')).toBe('not_enough_data');
  });
});
