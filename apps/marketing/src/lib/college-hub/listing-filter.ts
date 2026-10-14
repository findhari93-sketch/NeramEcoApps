/**
 * Client-side filtering for the college listings.
 *
 * /colleges/[state] used to be force-dynamic so it could read searchParams on
 * the server: every view was a function run plus three no-store queries. It is
 * now ISR; the page ships the state's full list (at most ~70 colleges) and
 * these functions apply the URL filters in the browser, with the same meaning
 * the Supabase query has (lib/college-hub/queries.ts getColleges).
 *
 * type, exam, city and naac take comma-separated lists ("Private,Deemed").
 */
import { EXAM_FILTERS } from './constants';
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
  'letter',
] as const;

const SORTS: ReadonlyArray<NonNullable<CollegeFilters['sortBy']>> = [
  'arch_index',
  'nirf_rank',
  'fee_low',
  'fee_high',
  'name',
  'placement_high',
  'naac_grade',
  'rating_high',
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

/** A comma-separated URL value as a list (empty parts dropped). */
export function splitMulti(value: string | undefined | null): string[] {
  return (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

export function parseListingFilters(sp: ParamSource, base: { state?: string; limit?: number }): CollegeFilters {
  const get = getter(sp);
  const sort = get('sort') as CollegeFilters['sortBy'];
  const page = num(get('page'));
  const letter = get('letter')?.trim().toUpperCase();
  const rating = num(get('rating'));
  return {
    state: base.state ?? get('state'),
    type: get('type'),
    counselingSystem: get('counseling') as CollegeFilters['counselingSystem'],
    exam: get('exam'),
    city: get('city'),
    coa: get('coa') === 'true' ? true : undefined,
    naacGrade: get('naac'),
    minFee: num(get('minFee')),
    maxFee: num(get('maxFee')),
    search: get('q'),
    letter: letter && /^[A-Z]$/.test(letter) ? letter : undefined,
    rating: rating && rating > 0 && rating <= 5 ? rating : undefined,
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

// ─── Normalisation (the DB mixes spellings) ──────────────────────────────────

/** Canonical lower-case college type: "Private" and "private" are one type. */
export function typeKey(type: string | null | undefined): string {
  return (type ?? '').trim().toLowerCase();
}

/** Every stored spelling of the given types, for a Supabase .in() filter. */
export function typeSpellings(types: readonly string[]): string[] {
  const out = new Set<string>();
  for (const t of types) {
    const lower = t.trim().toLowerCase();
    if (!lower) continue;
    out.add(t.trim());
    out.add(lower);
    out.add(lower.replace(/\b\w/g, (c) => c.toUpperCase()));
    out.add(lower.charAt(0).toUpperCase() + lower.slice(1));
  }
  return [...out];
}

/** Exam filter values to every accepted_exams spelling they match. */
export function expandExamFilter(values: readonly string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const def = EXAM_FILTERS.find((e) => e.value === v);
    if (def) def.matches.forEach((m) => out.add(m));
    else out.add(v);
  }
  return [...out];
}

function hasExam(c: ListingCollege, value: string): boolean {
  const accepted = c.accepted_exams ?? [];
  return expandExamFilter([value]).some((m) => accepted.includes(m));
}

// ─── Filtering ───────────────────────────────────────────────────────────────

type FacetKey = 'type' | 'exam' | 'city' | 'naac' | 'rating' | 'state';

function passes(c: ListingCollege, f: CollegeFilters, skip?: FacetKey): boolean {
  if (skip !== 'state') {
    const states = splitMulti(f.state);
    if (states.length && !states.includes(c.state_slug ?? '')) return false;
  }
  if (skip !== 'type') {
    const types = splitMulti(f.type).map(typeKey);
    if (types.length && !types.includes(typeKey(c.type))) return false;
  }
  if (f.counselingSystem && !(c.counseling_systems ?? []).includes(f.counselingSystem)) return false;
  if (skip !== 'exam') {
    const exams = splitMulti(f.exam);
    if (exams.length && !exams.some((e) => hasExam(c, e))) return false;
  }
  if (skip !== 'city') {
    const cities = splitMulti(f.city);
    if (cities.length && !cities.includes(c.city_slug ?? '')) return false;
  }
  if (f.coa !== undefined && c.coa_approved !== f.coa) return false;
  if (skip !== 'naac') {
    const grades = splitMulti(f.naacGrade);
    if (grades.length && !grades.includes(c.naac_grade ?? 'none')) return false;
  }
  if (f.minFee && (c.annual_fee_approx == null || c.annual_fee_approx < f.minFee)) return false;
  if (f.maxFee && (c.annual_fee_approx == null || c.annual_fee_approx > f.maxFee)) return false;
  const needle = f.search?.trim().toLowerCase();
  if (needle && !c.name.toLowerCase().includes(needle) && !(c.city ?? '').toLowerCase().includes(needle)) return false;
  if (f.letter && !c.name.toUpperCase().startsWith(f.letter)) return false;
  if (skip !== 'rating' && f.rating && (c.review_avg == null || c.review_avg < f.rating)) return false;
  return true;
}

type NullableNumberKey =
  | 'arch_index_score'
  | 'nirf_rank_architecture'
  | 'annual_fee_approx'
  | 'avg_placement_salary'
  | 'review_avg';

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
  rating_high: byNumber('review_avg', false),
};

/** Filters and sorts a copy of the list (pagination is the caller's). */
export function filterAndSortColleges<T extends ListingCollege>(list: readonly T[], f: CollegeFilters): T[] {
  const out = list.filter((c) => passes(c, f));
  // Array.prototype.sort is stable, so ties keep the server's order.
  return out.sort(COMPARATORS[f.sortBy ?? 'arch_index']);
}

// ─── Facet counts (filter rail and mobile sheet) ─────────────────────────────

export interface FacetCounts {
  state: Record<string, number>;
  type: Record<string, number>;
  exam: Record<string, number>;
  city: Record<string, number>;
  naac: Record<string, number>;
  rating: Record<string, number>;
}

/**
 * How many colleges each option would show, with every other active filter
 * applied (the option's own group is ignored, so picking one never zeroes
 * its siblings). Options with 0 render disabled.
 */
export function facetCounts(list: readonly ListingCollege[], f: CollegeFilters): FacetCounts {
  const out: FacetCounts = { state: {}, type: {}, exam: {}, city: {}, naac: {}, rating: {} };
  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };
  for (const c of list) {
    if (passes(c, f, 'state') && c.state_slug) bump(out.state, c.state_slug);
    if (passes(c, f, 'type')) bump(out.type, typeKey(c.type));
    if (passes(c, f, 'exam')) {
      for (const e of EXAM_FILTERS) if (hasExam(c, e.value)) bump(out.exam, e.value);
    }
    if (passes(c, f, 'city') && c.city_slug) bump(out.city, c.city_slug);
    if (passes(c, f, 'naac')) bump(out.naac, c.naac_grade ?? 'none');
    if (passes(c, f, 'rating') && c.review_avg != null) {
      for (const r of [4.5, 4, 3.5]) if (c.review_avg >= r) bump(out.rating, String(r));
    }
  }
  return out;
}

/** Number of colleges the given filters would show (the "Show N colleges" button). */
export function countMatches(list: readonly ListingCollege[], f: CollegeFilters): number {
  let n = 0;
  for (const c of list) if (passes(c, f)) n += 1;
  return n;
}

/** First letters that have at least one college (A to Z jump). */
export function lettersOf(list: readonly ListingCollege[]): Set<string> {
  const out = new Set<string>();
  for (const c of list) {
    const ch = c.name.trim().charAt(0).toUpperCase();
    if (/[A-Z]/.test(ch)) out.add(ch);
  }
  return out;
}

/** Annual-fee buckets for the filter rail histogram. */
export const FEE_BUCKETS = [
  { max: 50000 },
  { max: 100000 },
  { max: 150000 },
  { max: 200000 },
  { max: 300000 },
  { max: Infinity },
] as const;

export function feeHistogram(list: readonly ListingCollege[]): number[] {
  const counts = FEE_BUCKETS.map(() => 0);
  for (const c of list) {
    const fee = c.annual_fee_approx;
    if (fee == null) continue;
    const i = FEE_BUCKETS.findIndex((b) => fee <= b.max);
    counts[i === -1 ? counts.length - 1 : i] += 1;
  }
  return counts;
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

export function stateCountsOf(list: readonly ListingCollege[]): { state: string; state_slug: string; count: number }[] {
  const counts = new Map<string, { state: string; state_slug: string; count: number }>();
  for (const c of list) {
    if (!c.state_slug) continue;
    const row = counts.get(c.state_slug);
    if (row) row.count += 1;
    else counts.set(c.state_slug, { state: c.state, state_slug: c.state_slug, count: 1 });
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
  'hero_image_credit',
  'admissions_phone',
  'brochure_url',
  'avg_placement_salary',
  'highlights',
  'review_avg',
  'review_count',
  'cutoff_value',
  'cutoff_type',
  'cutoff_system',
  'cutoff_year',
] as const satisfies ReadonlyArray<keyof CollegeListItem>;

export type ListingCollege = Pick<CollegeListItem, (typeof LISTING_COLLEGE_FIELDS)[number]>;

export function toListingCollege(c: CollegeListItem): ListingCollege {
  const out = {} as Record<string, unknown>;
  for (const key of LISTING_COLLEGE_FIELDS) {
    if (c[key] !== undefined) out[key] = c[key];
  }
  return out as ListingCollege;
}
