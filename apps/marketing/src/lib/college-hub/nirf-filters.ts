/**
 * URL search-param helpers for the NIRF rankings listing page.
 * Filter state is fully encoded in the URL so links are shareable, the
 * back button works, and the page can render as a Server Component without
 * client state.
 */

export interface NIRFFilters {
  years: number[];
  state?: string;
  city?: string;
  type?: string;
  scoreMin?: number;
  scoreMax?: number;
  rankMin?: number;
  rankMax?: number;
  search?: string;
  sort: 'rank_asc' | 'score_desc' | 'name_asc';
  compare: boolean;
  page: number;
}

export const NIRF_SORT_OPTIONS: Array<{ value: NIRFFilters['sort']; label: string }> = [
  { value: 'rank_asc', label: 'Best rank (latest year)' },
  { value: 'score_desc', label: 'Highest score' },
  { value: 'name_asc', label: 'College name A to Z' },
];

export const DEFAULT_FILTERS: NIRFFilters = {
  years: [],
  sort: 'rank_asc',
  compare: false,
  page: 1,
};

function intParam(v: string | string[] | undefined): number | undefined {
  if (Array.isArray(v)) v = v[0];
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function strParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) v = v[0];
  if (!v) return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function parseYears(v: string | string[] | undefined): number[] {
  if (Array.isArray(v)) v = v.join(',');
  if (!v) return [];
  return v
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

export function parseNIRFFilters(
  sp: Record<string, string | string[] | undefined>,
): NIRFFilters {
  const years = parseYears(sp.year ?? sp.years);
  const sortRaw = strParam(sp.sort) as NIRFFilters['sort'] | undefined;
  const validSort = NIRF_SORT_OPTIONS.find((o) => o.value === sortRaw);
  return {
    years,
    state: strParam(sp.state),
    city: strParam(sp.city),
    type: strParam(sp.type),
    scoreMin: intParam(sp.scoreMin),
    scoreMax: intParam(sp.scoreMax),
    rankMin: intParam(sp.rankMin),
    rankMax: intParam(sp.rankMax),
    search: strParam(sp.q ?? sp.search),
    sort: (validSort?.value as NIRFFilters['sort']) ?? 'rank_asc',
    compare: strParam(sp.compare) === '1',
    page: Math.max(1, intParam(sp.page) ?? 1),
  };
}

/**
 * Serialize a filter object back into a URLSearchParams. Empty / default
 * values are omitted so canonical URLs stay clean.
 */
export function serializeNIRFFilters(f: Partial<NIRFFilters>): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.years && f.years.length) sp.set('year', f.years.join(','));
  if (f.state) sp.set('state', f.state);
  if (f.city) sp.set('city', f.city);
  if (f.type) sp.set('type', f.type);
  if (f.scoreMin !== undefined) sp.set('scoreMin', String(f.scoreMin));
  if (f.scoreMax !== undefined) sp.set('scoreMax', String(f.scoreMax));
  if (f.rankMin !== undefined) sp.set('rankMin', String(f.rankMin));
  if (f.rankMax !== undefined) sp.set('rankMax', String(f.rankMax));
  if (f.search) sp.set('q', f.search);
  if (f.sort && f.sort !== 'rank_asc') sp.set('sort', f.sort);
  if (f.compare) sp.set('compare', '1');
  if (f.page && f.page > 1) sp.set('page', String(f.page));
  return sp;
}

export function hasActiveFilters(f: NIRFFilters): boolean {
  return Boolean(
    f.years.length ||
      f.state ||
      f.city ||
      f.type ||
      f.scoreMin !== undefined ||
      f.scoreMax !== undefined ||
      f.rankMin !== undefined ||
      f.rankMax !== undefined ||
      f.search ||
      f.sort !== 'rank_asc',
  );
}

export const COLLEGE_TYPE_OPTIONS = [
  { value: 'government', label: 'Government' },
  { value: 'private', label: 'Private' },
  { value: 'deemed', label: 'Deemed' },
  { value: 'autonomous', label: 'Autonomous' },
];
