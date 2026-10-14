import { describe, expect, it } from 'vitest';
import { buildCompareSections, latestCutoff } from './compare-rows';
import type { CollegeCutoff, CollegeDetail } from './types';

function college(over: Partial<CollegeDetail>): CollegeDetail {
  return {
    id: over.slug ?? 'x',
    slug: 'x',
    name: 'X College',
    city: 'Chennai',
    state: 'Tamil Nadu',
    state_slug: 'tamil-nadu',
    type: 'Private',
    coa_approved: true,
    naac_grade: null,
    nirf_rank_architecture: null,
    annual_fee_approx: null,
    annual_fee_min: null,
    total_barch_seats: null,
    accepted_exams: ['NATA'],
    counseling_systems: ['TNEA'],
    avg_placement_salary: null,
    established_year: null,
    fees: [],
    cutoffs: [],
    placements: [],
    infrastructure: null,
    faculty: [],
    ...over,
  } as unknown as CollegeDetail;
}

const cut = (over: Partial<CollegeCutoff>): CollegeCutoff =>
  ({ id: '1', college_id: 'x', academic_year: '2025', counseling_system: 'TNEA', round_number: 1, category: 'general', cutoff_type: 'score', cutoff_value: 150, total_seats: null, filled_seats: null, source: null, ...over }) as CollegeCutoff;

const row = (sections: ReturnType<typeof buildCompareSections>, key: string) => sections.flatMap((s) => s.rows).find((r) => r.key === key);

describe('buildCompareSections', () => {
  const a = college({ slug: 'a', type: 'Government', annual_fee_approx: 25000, total_barch_seats: 74 });
  const b = college({ slug: 'b', annual_fee_approx: 200000, total_barch_seats: 100 });

  it('tags the lowest fee and the most seats', () => {
    const s = buildCompareSections([a, b]);
    expect(row(s, 'fee')!.cells.map((c) => c.best)).toEqual([true, false]);
    expect(row(s, 'five')!.cells[0].value).toBe('₹1.3L');
    expect(row(s, 'seats')!.cells.map((c) => c.best)).toEqual([false, true]);
  });

  it('marks rows that are the same and hides them on "differences only"', () => {
    const s = buildCompareSections([a, b]);
    expect(row(s, 'coa')!.same).toBe(true);
    expect(row(buildCompareSections([a, b], true), 'coa')).toBeUndefined();
    expect(row(buildCompareSections([a, b], true), 'type')).toBeDefined();
  });

  it('drops optional rows nobody has and whole empty sections', () => {
    const s = buildCompareSections([a, b]);
    expect(row(s, 'cutoff')).toBeUndefined();
    expect(row(s, 'package')).toBeUndefined();
    expect(s.find((x) => x.id === 'outcomes')).toBeUndefined();
  });

  it('gives no Best tag with only one real number', () => {
    const c = college({ slug: 'c', annual_fee_approx: null });
    expect(row(buildCompareSections([a, c]), 'fee')!.cells.map((x) => x.best)).toEqual([false, false]);
    expect(row(buildCompareSections([a, c]), 'fee')!.cells[1]).toMatchObject({ value: 'Not published', missing: true });
  });

  it('shows the latest general-category, last-round cutoff', () => {
    const cuts = [
      cut({ academic_year: '2024', cutoff_value: 140 }),
      cut({ academic_year: '2025', round_number: 1, cutoff_value: 160 }),
      cut({ academic_year: '2025', round_number: 3, cutoff_value: 151 }),
      cut({ academic_year: '2025', round_number: 4, category: 'obc', cutoff_value: 120 }),
    ];
    expect(latestCutoff(cuts)?.cutoff_value).toBe(151);
    const s = buildCompareSections([college({ slug: 'd', cutoffs: cuts }), b]);
    expect(row(s, 'cutoff')!.cells[0].value).toBe('TNEA 2025 · 151');
  });
});
