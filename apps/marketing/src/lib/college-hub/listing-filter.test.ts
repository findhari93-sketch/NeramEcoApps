import { describe, it, expect } from 'vitest';
import {
  LISTING_FILTER_KEYS,
  cityCountsOf,
  countMatches,
  expandExamFilter,
  facetCounts,
  feeHistogram,
  filterAndSortColleges,
  lettersOf,
  stateCountsOf,
  typeSpellings,
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

describe('directory redesign filters', () => {
  const mixed = [
    college({ slug: 'p1', name: 'Pune Arch', type: 'Private', accepted_exams: ['NATA'], city_slug: 'pune', naac_grade: 'A', review_avg: 4.6, review_count: 10 }),
    college({ slug: 'p2', name: 'Mumbai Arch', type: 'private', accepted_exams: ['JEE Main'], city_slug: 'mumbai', naac_grade: null, review_avg: 3.9, review_count: 2 }),
    college({ slug: 'g1', name: 'Govt Arch', type: 'Government', accepted_exams: ['JEE_PAPER_2', 'NATA'], city_slug: 'pune', naac_grade: 'B+' }),
    college({ slug: 'd1', name: 'Deemed Arch', type: 'deemed', accepted_exams: ['JEE Main Paper 2'], city_slug: 'nagpur', naac_grade: 'A' }),
  ];

  it('reads letter and rating from the URL, ignoring junk', () => {
    expect(parseListingFilters(new URLSearchParams('letter=p&rating=4'), {})).toMatchObject({ letter: 'P', rating: 4 });
    expect(parseListingFilters(new URLSearchParams('letter=pp&rating=9'), {})).toMatchObject({ letter: undefined, rating: undefined });
  });

  it('matches type case-insensitively and takes comma lists', () => {
    expect(slugs(filterAndSortColleges(mixed, { type: 'private' }))).toEqual(['p1', 'p2']);
    expect(slugs(filterAndSortColleges(mixed, { type: 'Private,deemed' }))).toEqual(['p1', 'p2', 'd1']);
  });

  it('treats every JEE spelling as JEE Main Paper 2', () => {
    expect(slugs(filterAndSortColleges(mixed, { exam: 'JEE_PAPER_2' }))).toEqual(['p2', 'g1', 'd1']);
    expect(slugs(filterAndSortColleges(mixed, { exam: 'NATA,JEE_PAPER_2' }))).toHaveLength(4);
  });

  it('filters city lists, NAAC with "none", letter, rating and city search', () => {
    expect(slugs(filterAndSortColleges(mixed, { city: 'pune,nagpur' }))).toEqual(['p1', 'g1', 'd1']);
    expect(slugs(filterAndSortColleges(mixed, { naacGrade: 'A,none' }))).toEqual(['p1', 'p2', 'd1']);
    expect(slugs(filterAndSortColleges(mixed, { letter: 'G' }))).toEqual(['g1']);
    expect(slugs(filterAndSortColleges(mixed, { rating: 4 }))).toEqual(['p1']);
    expect(slugs(filterAndSortColleges(list, { search: 'coimba' }))).toEqual(['b']);
  });

  it('sorts by rating with unrated colleges last', () => {
    expect(slugs(filterAndSortColleges(mixed, { sortBy: 'rating_high' })).slice(0, 2)).toEqual(['p1', 'p2']);
  });

  it('counts each option with the other filters applied', () => {
    const f = facetCounts(mixed, { city: 'pune' });
    // Type counts respect the city filter...
    expect(f.type).toEqual({ private: 1, government: 1 });
    // ...but city counts ignore it, so picking one never zeroes the others.
    expect(f.city).toEqual({ pune: 2, mumbai: 1, nagpur: 1 });
    expect(f.exam).toEqual({ NATA: 2, JEE_PAPER_2: 1 });
    expect(f.naac).toEqual({ A: 1, 'B+': 1 });
    expect(countMatches(mixed, { city: 'pune', type: 'government' })).toBe(1);
  });

  it('expands filters for the server query', () => {
    expect(expandExamFilter(['JEE_PAPER_2'])).toEqual(['JEE_PAPER_2', 'JEE Main Paper 2', 'JEE Main']);
    expect(typeSpellings(['private'])).toEqual(expect.arrayContaining(['private', 'Private']));
  });

  it('filters and counts states for category pages', () => {
    const india = [
      college({ slug: 't1', state_slug: 'tamil-nadu', state: 'Tamil Nadu' }),
      college({ slug: 't2', state_slug: 'tamil-nadu', state: 'Tamil Nadu', type: 'Government' }),
      college({ slug: 'k1', state_slug: 'kerala', state: 'Kerala' }),
    ];
    expect(slugs(filterAndSortColleges(india, { state: 'kerala,tamil-nadu' }))).toHaveLength(3);
    expect(slugs(filterAndSortColleges(india, { state: 'kerala' }))).toEqual(['k1']);
    // State counts ignore the state filter but respect the others.
    expect(facetCounts(india, { state: 'kerala', type: 'government' }).state).toEqual({ 'tamil-nadu': 1 });
    expect(stateCountsOf(india)).toEqual([
      { state: 'Tamil Nadu', state_slug: 'tamil-nadu', count: 2 },
      { state: 'Kerala', state_slug: 'kerala', count: 1 },
    ]);
  });

  it('knows which letters have colleges and buckets fees', () => {
    expect([...lettersOf(mixed)].sort()).toEqual(['D', 'G', 'M', 'P']);
    // 90K, 1.5L, 2.5L (one unknown fee is skipped).
    expect(feeHistogram(list)).toEqual([0, 1, 1, 0, 1, 0]);
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
