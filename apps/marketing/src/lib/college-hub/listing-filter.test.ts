import { describe, it, expect } from 'vitest';
import {
  LISTING_FILTER_KEYS,
  cityCountsOf,
  filterAndSortColleges,
  hasListingFilters,
  parseListingFilters,
  toListingCollege,
  typeCountsOf,
} from './listing-filter';
import type { CollegeListItem } from './types';

function college(over: Partial<CollegeListItem>): CollegeListItem {
  return {
    id: over.slug ?? 'x',
    slug: 'x',
    name: 'X College',
    short_name: null,
    city: 'Chennai',
    state: 'Tamil Nadu',
    state_slug: 'tamil-nadu',
    type: 'private',
    neram_tier: 'free',
    coa_approved: true,
    naac_grade: null,
    nirf_rank: null,
    nirf_rank_architecture: null,
    arch_index_score: null,
    annual_fee_min: null,
    annual_fee_max: null,
    annual_fee_approx: null,
    total_barch_seats: null,
    accepted_exams: ['NATA'],
    counseling_systems: ['TNEA'],
    logo_url: null,
    hero_image_url: null,
    admissions_phone: null,
    brochure_url: null,
    avg_placement_salary: null,
    min_placement_salary: null,
    max_placement_salary: null,
    city_slug: 'chennai',
    highlights: null,
    verified: false,
    data_completeness: 0,
    ...over,
  } as CollegeListItem;
}

const list = [
  college({ slug: 'a', name: 'Anna School', arch_index_score: 70, annual_fee_approx: 90000, type: 'government', naac_grade: 'A++', nirf_rank_architecture: 3, avg_placement_salary: 500000 }),
  college({ slug: 'b', name: 'Beta Institute', arch_index_score: 90, annual_fee_approx: 250000, city: 'Coimbatore', city_slug: 'coimbatore', accepted_exams: ['NATA', 'JEE_PAPER_2'], naac_grade: 'A' }),
  college({ slug: 'c', name: 'Gamma College', arch_index_score: null, annual_fee_approx: null, coa_approved: false, accepted_exams: ['JEE_PAPER_2'], nirf_rank_architecture: 1 }),
  college({ slug: 'd', name: 'Delta Academy', arch_index_score: 50, annual_fee_approx: 150000, avg_placement_salary: 900000 }),
];

const slugs = (xs: Array<{ slug: string }>) => xs.map((x) => x.slug);

describe('parseListingFilters', () => {
  it('reads the same params the server used to read', () => {
    const f = parseListingFilters(
      new URLSearchParams('type=private&exam=NATA&city=chennai&coa=true&naac=A&minFee=1000&maxFee=200000&q=anna&sort=fee_low&page=2&counseling=TNEA&state=kerala'),
      { state: 'tamil-nadu' },
    );
    expect(f).toMatchObject({
      state: 'tamil-nadu', // a route state wins over ?state=
      type: 'private',
      exam: 'NATA',
      city: 'chennai',
      coa: true,
      naacGrade: 'A',
      minFee: 1000,
      maxFee: 200000,
      search: 'anna',
      sortBy: 'fee_low',
      page: 2,
      counselingSystem: 'TNEA',
    });
  });

  it('defaults to ArchIndex order, page 1, and ignores junk numbers', () => {
    const f = parseListingFilters(new URLSearchParams('minFee=abc&page=-3&sort=bogus'), {});
    expect(f.sortBy).toBe('arch_index');
    expect(f.page).toBe(1);
    expect(f.minFee).toBeUndefined();
  });

  it('accepts a plain record too', () => {
    expect(parseListingFilters({ state: 'kerala' }, {}).state).toBe('kerala');
  });
});

describe('hasListingFilters', () => {
  it('is false for no params or only the view mode', () => {
    expect(hasListingFilters(new URLSearchParams(''))).toBe(false);
    expect(hasListingFilters(new URLSearchParams('view=grid'))).toBe(false);
  });
  it.each(LISTING_FILTER_KEYS)('is true when %s is set', (key) => {
    expect(hasListingFilters(new URLSearchParams(`${key}=1`))).toBe(true);
  });
});

describe('filterAndSortColleges', () => {
  it('sorts by ArchIndex, highest first, nulls last (the default)', () => {
    expect(slugs(filterAndSortColleges(list, {}))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('sorts by fee both ways with unknown fees last', () => {
    expect(slugs(filterAndSortColleges(list, { sortBy: 'fee_low' }))).toEqual(['a', 'd', 'b', 'c']);
    expect(slugs(filterAndSortColleges(list, { sortBy: 'fee_high' }))).toEqual(['b', 'd', 'a', 'c']);
  });

  it('sorts by NIRF rank, name, placement and NAAC grade', () => {
    expect(slugs(filterAndSortColleges(list, { sortBy: 'nirf_rank' }))).toEqual(['c', 'a', 'b', 'd']);
    expect(slugs(filterAndSortColleges(list, { sortBy: 'name' }))).toEqual(['a', 'b', 'd', 'c']);
    expect(slugs(filterAndSortColleges(list, { sortBy: 'placement_high' }))).toEqual(['d', 'a', 'b', 'c']);
    expect(slugs(filterAndSortColleges(list, { sortBy: 'naac_grade' })).slice(0, 2)).toEqual(['b', 'a']);
  });

  it('filters by type, exam, city, COA, NAAC, fee range and name search', () => {
    expect(slugs(filterAndSortColleges(list, { type: 'government' }))).toEqual(['a']);
    expect(slugs(filterAndSortColleges(list, { exam: 'JEE_PAPER_2' }))).toEqual(['b', 'c']);
    expect(slugs(filterAndSortColleges(list, { city: 'coimbatore' }))).toEqual(['b']);
    expect(slugs(filterAndSortColleges(list, { coa: true }))).toEqual(['b', 'a', 'd']);
    expect(slugs(filterAndSortColleges(list, { naacGrade: 'A' }))).toEqual(['b']);
    expect(slugs(filterAndSortColleges(list, { minFee: 100000, maxFee: 200000 }))).toEqual(['d']);
    expect(slugs(filterAndSortColleges(list, { search: 'ACAD' }))).toEqual(['d']);
    expect(slugs(filterAndSortColleges(list, { counselingSystem: 'TNEA' as never }))).toHaveLength(4);
  });

  it('does not mutate its input', () => {
    const before = slugs(list);
    filterAndSortColleges(list, { sortBy: 'name' });
    expect(slugs(list)).toEqual(before);
  });
});

describe('counts and trimming', () => {
  it('counts cities and types for the sidebar', () => {
    expect(cityCountsOf(list)).toEqual([
      { city: 'Chennai', city_slug: 'chennai', count: 3 },
      { city: 'Coimbatore', city_slug: 'coimbatore', count: 1 },
    ]);
    expect(typeCountsOf(list)).toEqual([
      { type: 'private', count: 3 },
      { type: 'government', count: 1 },
    ]);
  });

  it('keeps only the fields the cards and filters read', () => {
    const t = toListingCollege(list[0]) as Record<string, unknown>;
    expect(t.slug).toBe('a');
    expect(t.arch_index_score).toBe(70);
    for (const dropped of ['nirf_rank', 'annual_fee_max', 'min_placement_salary', 'max_placement_salary', 'verified', 'data_completeness']) {
      expect(t).not.toHaveProperty(dropped);
    }
  });
});
