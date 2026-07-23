/**
 * Unit tests for plan shape.
 *
 * A teaching plan decides the shape of the teaching day, and the shape changes
 * mid-year on a date nobody knows in advance. Two things must not break: bands
 * always come back drawable no matter what is in the JSONB column, and a week
 * that straddles the regular-to-crash changeover shows BOTH shapes rather than
 * silently picking one.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CRASH_BANDS,
  DEFAULT_REGULAR_BANDS,
  bandMinutes,
  describeBands,
  findOverlap,
  mergeBands,
  normaliseBands,
  normaliseDays,
  normalisePlanShape,
  planCoversDate,
  plansForDate,
  resolvePlanShapeForDates,
  validatePlanShape,
  type PlanShape,
} from './plan-shape';

const plan = (over: Partial<PlanShape>): PlanShape => ({
  id: 'regular',
  classroom_id: 'c1',
  title: 'Regular',
  start_date: '2026-06-01',
  end_date: '2027-03-17',
  bands: [{ start: '18:00', end: '21:00' }],
  days: [1, 2, 3, 4, 5, 6],
  status: 'active',
  ...over,
});

describe('normaliseBands', () => {
  it('accepts well-formed bands', () => {
    expect(normaliseBands([{ start: '09:00', end: '12:00', label: 'Morning' }])).toEqual([
      { start: '09:00', end: '12:00', label: 'Morning' },
    ]);
  });

  it('falls back when the column holds junk', () => {
    expect(normaliseBands(null)).toEqual(DEFAULT_REGULAR_BANDS);
    expect(normaliseBands('evening')).toEqual(DEFAULT_REGULAR_BANDS);
    expect(normaliseBands([])).toEqual(DEFAULT_REGULAR_BANDS);
  });

  it('drops invalid entries but keeps the good ones', () => {
    const bands = normaliseBands([
      { start: '09:00', end: '12:00' },
      { start: '25:00', end: '26:00' },
      { start: '20:00', end: '19:00' },
      { foo: 'bar' },
    ]);
    expect(bands).toEqual([{ start: '09:00', end: '12:00' }]);
  });

  it('uses the caller fallback when everything is invalid', () => {
    expect(normaliseBands([{ start: 'x', end: 'y' }], DEFAULT_CRASH_BANDS)).toEqual(DEFAULT_CRASH_BANDS);
  });

  it('never hands back a reference to the shared default', () => {
    const bands = normaliseBands(null);
    bands[0].start = '05:00';
    expect(DEFAULT_REGULAR_BANDS[0].start).toBe('18:00');
  });

  it('reads the legacy sessions_per_day spelling from nexus_course_plans', () => {
    // Production holds three different shapes in that column; the start_time /
    // end_time one must still draw rather than fall back to evening-only.
    expect(
      normaliseBands([
        { slot: 'am', label: 'Morning', start_time: '11:00', end_time: '12:00' },
        { slot: 'pm', label: 'Evening', start_time: '19:00', end_time: '20:00' },
      ]),
    ).toEqual([
      { start: '11:00', end: '12:00', label: 'Morning' },
      { start: '19:00', end: '20:00', label: 'Evening' },
    ]);
  });

  it('ignores a legacy entry that carries only a slot name', () => {
    expect(normaliseBands([{ slot: 'am', label: 'Morning' }])).toEqual(DEFAULT_REGULAR_BANDS);
  });
});

describe('mergeBands', () => {
  it('sorts by start time', () => {
    expect(mergeBands([{ start: '18:00', end: '20:00' }, { start: '09:00', end: '12:00' }])).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '18:00', end: '20:00' },
    ]);
  });

  it('merges overlapping bands, which would otherwise draw on top of each other', () => {
    expect(mergeBands([{ start: '09:00', end: '12:00' }, { start: '11:00', end: '14:00' }])).toEqual([
      { start: '09:00', end: '14:00' },
    ]);
  });

  it('merges touching bands, so there is no zero-width break', () => {
    expect(mergeBands([{ start: '09:00', end: '12:00' }, { start: '12:00', end: '14:00' }])).toEqual([
      { start: '09:00', end: '14:00' },
    ]);
  });

  it('keeps a genuine gap as two bands', () => {
    const merged = mergeBands([
      { start: '09:00', end: '12:00' },
      { start: '18:00', end: '20:00' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('swallows a band fully contained in another', () => {
    expect(mergeBands([{ start: '09:00', end: '17:00' }, { start: '10:00', end: '11:00' }])).toEqual([
      { start: '09:00', end: '17:00' },
    ]);
  });
});

describe('normaliseDays', () => {
  it('defaults to Mon through Sat', () => {
    expect(normaliseDays(null)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(normaliseDays([])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('sorts, dedupes and drops out-of-range values', () => {
    expect(normaliseDays([7, 1, 1, 0, 9, 3])).toEqual([1, 3, 7]);
  });
});

describe('normalisePlanShape', () => {
  it('reads expected_end_date as the end of the season', () => {
    const p = normalisePlanShape({ id: 'x', start_date: '2026-06-01', expected_end_date: '2027-03-17' });
    expect(p.end_date).toBe('2027-03-17');
  });

  it('treats a plan with no end date as open-ended, not broken', () => {
    expect(normalisePlanShape({ id: 'x', start_date: '2026-06-01' }).end_date).toBeNull();
  });

  it('falls back to evening-only when the column is empty', () => {
    expect(normalisePlanShape({ id: 'x' }).bands).toEqual(DEFAULT_REGULAR_BANDS);
  });

  it('trims a timestamp down to a date', () => {
    expect(normalisePlanShape({ start_date: '2026-06-01T00:00:00Z' }).start_date).toBe('2026-06-01');
  });
});

describe('validatePlanShape', () => {
  const valid = {
    bands: [
      { start: '09:00', end: '12:30' },
      { start: '18:00', end: '20:00' },
    ],
    days: [1, 2, 3, 4, 5, 6],
  };

  it('accepts a well-formed split day', () => {
    const result = validatePlanShape(valid);
    expect(result.ok).toBe(true);
    expect(result.value?.bands).toHaveLength(2);
  });

  it('demands at least one band', () => {
    expect(validatePlanShape({ ...valid, bands: [] }).error).toMatch(/at least one time band/i);
  });

  it('demands at least one day', () => {
    expect(validatePlanShape({ ...valid, days: [] }).error).toMatch(/at least one day/i);
  });

  it('reports a bad band instead of silently dropping it', () => {
    // normaliseBands repairs quietly; validatePlanShape must not, or the user
    // loses a row they thought they saved.
    expect(validatePlanShape({ ...valid, bands: [{ start: '25:00', end: '26:00' }] }).error).toMatch(
      /invalid start time/i,
    );
    expect(validatePlanShape({ ...valid, bands: [{ start: '20:00', end: '19:00' }] }).error).toMatch(
      /ends before it starts/i,
    );
  });

  it('refuses an absurd number of bands', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      start: `0${i + 1}:00`,
      end: `0${i + 1}:30`,
    }));
    expect(validatePlanShape({ bands: many }).error).toMatch(/remove one/i);
  });

  it('merges bands on the way through', () => {
    const result = validatePlanShape({
      bands: [
        { start: '18:00', end: '20:00' },
        { start: '09:00', end: '12:00' },
      ],
    });
    expect(result.value?.bands[0].start).toBe('09:00');
  });
});

describe('findOverlap', () => {
  const existing = [
    { id: 'a', title: 'Regular', start_date: '2026-06-01', end_date: '2027-03-17' },
    { id: 'b', title: 'Crash course', start_date: '2027-03-18', end_date: '2027-06-10' },
  ];

  it('is quiet about a plan that slots into a gap', () => {
    expect(findOverlap({ start_date: '2027-06-11', end_date: '2027-07-31' }, existing)).toEqual([]);
  });

  it('names the plan in the way', () => {
    expect(findOverlap({ start_date: '2027-03-01', end_date: '2027-04-01' }, existing)[0].title).toBe(
      'Regular',
    );
  });

  it('treats ranges as inclusive, so sharing a boundary day overlaps', () => {
    expect(findOverlap({ start_date: '2027-03-17', end_date: '2027-03-20' }, existing)).toHaveLength(2);
  });

  it('ignores the plan being edited', () => {
    expect(
      findOverlap({ id: 'a', start_date: '2026-06-01', end_date: '2027-03-17' }, existing),
    ).toEqual([]);
  });

  it('treats an open-ended plan as running forever', () => {
    expect(findOverlap({ start_date: '2027-01-01', end_date: null }, existing)).toHaveLength(2);
  });
});

describe('planCoversDate / plansForDate', () => {
  const plans = [
    plan({ id: 'reg' }),
    plan({ id: 'crash', title: 'Crash', start_date: '2027-03-18', end_date: '2027-06-10' }),
  ];

  it('finds the plan covering a date', () => {
    expect(plansForDate(plans, '2026-09-01').map((p) => p.id)).toEqual(['reg']);
    expect(plansForDate(plans, '2027-04-01').map((p) => p.id)).toEqual(['crash']);
  });

  it('includes both boundary days', () => {
    expect(plansForDate(plans, '2027-03-17').map((p) => p.id)).toEqual(['reg']);
    expect(plansForDate(plans, '2027-03-18').map((p) => p.id)).toEqual(['crash']);
  });

  it('returns nothing in a gap between plans', () => {
    expect(plansForDate(plans, '2027-08-01')).toEqual([]);
  });

  it('lets an open-ended plan cover any later date', () => {
    expect(planCoversDate(plan({ end_date: null }), '2099-01-01')).toBe(true);
  });

  it('never covers a date before the plan starts', () => {
    expect(planCoversDate(plan({ end_date: null }), '2020-01-01')).toBe(false);
  });
});

describe('resolvePlanShapeForDates', () => {
  const regular = plan({ id: 'reg', bands: [{ start: '18:00', end: '21:00' }], days: [1, 2, 3, 4, 5, 6] });
  const crash = plan({
    id: 'crash',
    title: 'Crash course',
    start_date: '2027-03-18',
    end_date: '2027-06-10',
    bands: [
      { start: '09:00', end: '12:30' },
      { start: '18:00', end: '20:00' },
    ],
    days: [1, 2, 3, 4, 5, 6, 7],
  });

  it('returns one plan’s bands for an ordinary week', () => {
    const r = resolvePlanShapeForDates([regular, crash], ['2026-09-01', '2026-09-02']);
    expect(r.bands).toEqual([{ start: '18:00', end: '21:00' }]);
    expect(r.planNames).toEqual(['Regular']);
  });

  it('shows BOTH shapes across a changeover week rather than picking one', () => {
    // The board exams end on the Wednesday; the crash course starts Thursday.
    const r = resolvePlanShapeForDates(
      [regular, crash],
      ['2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18', '2027-03-19'],
    );
    expect(r.planNames).toHaveLength(2);
    // Morning appears, and the two evening bands merge into the wider one.
    expect(r.bands).toEqual([
      { start: '09:00', end: '12:30' },
      { start: '18:00', end: '21:00' },
    ]);
  });

  it('unions the weekdays across a changeover, so a Sunday crash class gets a column', () => {
    const r = resolvePlanShapeForDates([regular, crash], ['2027-03-17', '2027-03-18']);
    expect(r.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns nothing for a week with no plan, so the caller can fall back', () => {
    const r = resolvePlanShapeForDates([regular], ['2028-01-01']);
    expect(r.bands).toEqual([]);
    expect(r.planNames).toEqual([]);
  });

  it('does not duplicate a plan seen on several days', () => {
    const r = resolvePlanShapeForDates([regular], ['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(r.planNames).toEqual(['Regular']);
  });

  it('unions two plans that overlap on the SAME day, rather than dropping one', () => {
    // Overlapping plans are tolerated, unlike the terms they replaced. The old
    // model picked one covering term per date; this must keep both.
    const overlapping = plan({
      id: 'extra',
      title: 'Doubt clearing',
      start_date: '2026-06-01',
      end_date: '2027-03-17',
      bands: [{ start: '07:00', end: '08:00' }],
      days: [7],
    });
    const r = resolvePlanShapeForDates([regular, overlapping], ['2026-09-01']);
    expect(r.planNames).toHaveLength(2);
    expect(r.bands).toEqual([
      { start: '07:00', end: '08:00' },
      { start: '18:00', end: '21:00' },
    ]);
    expect(r.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('describeBands / bandMinutes', () => {
  it('describes a single evening band', () => {
    expect(describeBands([{ start: '18:00', end: '21:00' }])).toBe('6 PM to 9 PM');
  });

  it('describes a split day', () => {
    expect(
      describeBands([
        { start: '09:00', end: '12:30' },
        { start: '18:00', end: '20:00' },
      ]),
    ).toBe('9 AM to 12:30 PM, 6 PM to 8 PM');
  });

  it('handles no bands', () => {
    expect(describeBands([])).toBe('No class hours set');
  });

  it('totals teaching minutes across bands', () => {
    expect(
      bandMinutes([
        { start: '09:00', end: '12:30' },
        { start: '18:00', end: '20:00' },
      ]),
    ).toBe(210 + 120);
  });
});
