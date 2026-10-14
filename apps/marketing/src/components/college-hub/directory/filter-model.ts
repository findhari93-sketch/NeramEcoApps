import type { CollegeFilters } from '@/lib/college-hub/types';
import { parseListingFilters, splitMulti } from '@/lib/college-hub/listing-filter';

export type SortKey = NonNullable<CollegeFilters['sortBy']>;

/** The filter state both the desktop rail and the mobile sheet edit. */
export interface FilterDraft {
  coa: boolean;
  q: string;
  exam: string[];
  type: string[];
  naac: string[];
  minFee?: number;
  maxFee?: number;
  city: string[];
  /** Category pages only; a state page fixes the state in its route. */
  state: string[];
  rating?: number;
  sort: SortKey;
  letter?: string;
}

type Params = { get(key: string): string | null };

export function readDraft(params: Params): FilterDraft {
  const f = parseListingFilters(params, {});
  return {
    coa: f.coa === true,
    q: f.search ?? '',
    exam: splitMulti(f.exam),
    type: splitMulti(f.type).map((t) => t.toLowerCase()),
    naac: splitMulti(f.naacGrade),
    minFee: f.minFee,
    maxFee: f.maxFee,
    city: splitMulti(f.city),
    state: splitMulti(f.state),
    rating: f.rating,
    sort: f.sortBy ?? 'arch_index',
    letter: f.letter,
  };
}

/** URL params for a draft (empty values left out). */
export function draftToQuery(d: FilterDraft): URLSearchParams {
  const q = new URLSearchParams();
  if (d.coa) q.set('coa', 'true');
  if (d.q.trim()) q.set('q', d.q.trim());
  if (d.exam.length) q.set('exam', d.exam.join(','));
  if (d.type.length) q.set('type', d.type.join(','));
  if (d.naac.length) q.set('naac', d.naac.join(','));
  if (d.minFee) q.set('minFee', String(d.minFee));
  if (d.maxFee) q.set('maxFee', String(d.maxFee));
  if (d.city.length) q.set('city', d.city.join(','));
  if (d.state.length) q.set('state', d.state.join(','));
  if (d.rating) q.set('rating', String(d.rating));
  if (d.sort !== 'arch_index') q.set('sort', d.sort);
  if (d.letter) q.set('letter', d.letter);
  return q;
}

/** The draft as listing filters (for counting matches before Apply). */
export function draftToFilters(d: FilterDraft, state?: string): CollegeFilters {
  return parseListingFilters(draftToQuery(d), { state });
}

export const EMPTY_DRAFT: FilterDraft = {
  coa: false,
  q: '',
  exam: [],
  type: [],
  naac: [],
  city: [],
  state: [],
  sort: 'arch_index',
};

/** Active filter groups (sort and letter are not filters). */
export function activeFilterCount(d: FilterDraft): number {
  return (
    (d.coa ? 1 : 0) +
    (d.q.trim() ? 1 : 0) +
    d.exam.length +
    d.type.length +
    d.naac.length +
    (d.minFee || d.maxFee ? 1 : 0) +
    d.city.length +
    d.state.length +
    (d.rating ? 1 : 0)
  );
}

export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
