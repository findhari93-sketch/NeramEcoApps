/**
 * Client-side filtering for the college listings.
 *
 * /colleges/[state] used to be force-dynamic so it could read searchParams on
 * the server: every view was a function run plus three no-store queries. It is
 * now ISR; the page ships the state's full list (at most ~70 colleges) and
 * these functions apply the URL filters in the browser, with the same meaning
 * the old Supabase query had (lib/college-hub/queries.ts getColleges).
 */
import type { CollegeFilters, CollegeListItem } from './types';

/** Page size of the /colleges "Browse all" section and /api/colleges/browse. */
export const BROWSE_PAGE_SIZE = 30;

/** URL params that change the result set ('view' only changes the layout). */
export const LISTING_FILTER_KEYS = [
  'state',
  'type',
  'counseling',
  'exam',
  'city',
  'coa',
  'naac',
  'minFee',
  'maxFee',
  'q',
  'sort',
  'page',
  'rating',
] as const;

const SORTS: ReadonlyArray<NonNullable<CollegeFilters['sortBy']>> = [
  'arch_index',
  'nirf_rank',
  'fee_low',
  'fee_high',
  'name',
  'placement_high',
  'naac_grade',
];

type ParamSource = URLSearchParams | { get(key: string): string | null } | Record<string, string | undefined>;

function getter(sp: ParamSource): (key: string) => string | undefined {
  if (typeof (sp as URLSearchParams).get === 'function') {
    return (key) => (sp as URLSearchParams).get(key) ?? undefined;
  }
  return (key) => (sp as Record<string, string | undefined>)[key] ?? undefined;
}

function num(v: string | undefined): number | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseListingFilters(sp: ParamSource, base: { state?: string; limit?: number }): CollegeFilters {
  const get = getter(sp);
  const sort = get('sort') as CollegeFilters['sortBy'];
  const page = num(get('page'));
  return {
    state: base.state ?? get('state'),
    type: get('type'),
    counselingSystem: get('counseling') as CollegeFilters['counselingSystem'],
    exam: get('exam') as CollegeFilters['exam'],
    city: get('city'),
    coa: get('coa') === 'true' ? true : undefined,
    naacGrade: get('naac'),
    minFee: num(get('minFee')),
    maxFee: num(get('maxFee')),
    search: get('q'),
    sortBy: sort && SORTS.includes(sort) ? sort : 'arch_index',
    page: page && page >= 1 ? Math.floor(page) : 1,
    limit: base.limit,
  };
}

export function hasListingFilters(sp: ParamSource): boolean {
  const get = getter(sp);
  return LISTING_FILTER_KEYS.some((k) => {
    const v = get(k);
    return v != null && v !== '';
  });
}

type NullableNumberKey = 'arch_index_score' | 'nirf_rank_architecture' | 'annual_fee_approx' | 'avg_placement_salary';

function byNumber(key: NullableNumberKey, ascending: boolean) {
  return (a: ListingCollege, b: ListingCollege) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1; // nulls last, both directions (PostgREST nullsFirst: false)
    if (y == null) return -1;
    return ascending ? x - y : y - x;
  };
}

function byText(key: 'name' | 'naac_grade') {
  return (a: ListingCollege, b: ListingCollege) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x < y ? -1 : x > y ? 1 : 0;
  };
}

const COMPARATORS: Record<NonNullable<CollegeFilters['sortBy']>, (a: ListingCollege, b: ListingCollege) => number> = {
  arch_index: byNumber('arch_index_score', false),
  nirf_rank: byNumber('nirf_rank_architecture', true),
  fee_low: byNumber('annual_fee_approx', true),
  fee_high: byNumber('annual_fee_approx', false),
  name: byText('name'),
  placement_high: byNumber('avg_placement_salary', false),
  naac_grade: byText('naac_grade'),
};

/** Filters and sorts a copy of the list (pagination is the caller's). */
export function filterAndSortColleges<T extends ListingCollege>(list: readonly T[], f: CollegeFilters): T[] {
  const needle = f.search?.trim().toLowerCase();
  const out = list.filter((c) => {
    if (f.state && c.state_slug !== f.state) return false;
    if (f.type && c.type !== f.type) return false;
    if (f.counselingSystem && !(c.counseling_systems ?? []).includes(f.counselingSystem)) return false;
    if (f.exam && !(c.accepted_exams ?? []).includes(f.exam)) return false;
    if (f.city && c.city_slug !== f.city) return false;
    if (f.coa !== undefined && c.coa_approved !== f.coa) return false;
    if (f.naacGrade && c.naac_grade !== f.naacGrade) return false;
    if (f.minFee && (c.annual_fee_approx == null || c.annual_fee_approx < f.minFee)) return false;
    if (f.maxFee && (c.annual_fee_approx == null || c.annual_fee_approx > f.maxFee)) return false;
    if (needle && !c.name.toLowerCase().includes(needle)) return false;
    return true;
  });
  // Array.prototype.sort is stable, so ties keep the server's order.
  return out.sort(COMPARATORS[f.sortBy ?? 'arch_index']);
}

export function cityCountsOf(list: readonly ListingCollege[]): { city: string; city_slug: string; count: number }[] {
  const counts = new Map<string, { city: string; city_slug: string; count: number }>();
  for (const c of list) {
    if (!c.city_slug) continue;
    const row = counts.get(c.city_slug);
    if (row) row.count += 1;
    else counts.set(c.city_slug, { city: c.city, city_slug: c.city_slug, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export function typeCountsOf(list: readonly ListingCollege[]): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of list) {
    if (!c.type) continue;
    counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

/** The fields the listing cards render plus the ones the filters and sorts read. */
export const LISTING_COLLEGE_FIELDS = [
  'id',
  'slug',
  'name',
  'short_name',
  'city',
  'state',
  'state_slug',
  'city_slug',
  'type',
  'neram_tier',
  'coa_approved',
  'naac_grade',
  'nirf_rank_architecture',
  'arch_index_score',
  'annual_fee_min',
  'annual_fee_approx',
  'total_barch_seats',
  'accepted_exams',
  'counseling_systems',
  'logo_url',
  'hero_image_url',
  'admissions_phone',
  'brochure_url',
  'avg_placement_salary',
  'highlights',
] as const satisfies ReadonlyArray<keyof CollegeListItem>;

export type ListingCollege = Pick<CollegeListItem, (typeof LISTING_COLLEGE_FIELDS)[number]>;

export function toListingCollege(c: CollegeListItem): ListingCollege {
  const out = {} as Record<string, unknown>;
  for (const key of LISTING_COLLEGE_FIELDS) out[key] = c[key];
  return out as ListingCollege;
}
