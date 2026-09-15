import type {
  InspirationBy,
  InspirationExam,
  InspirationFilters,
  InspirationScope,
  InspirationSort,
} from '@neram/database/queries/nexus';

/**
 * The Inspiration search state lives in the URL, so a search can be shared,
 * reloaded and returned to with Back. The API route parses its own query string
 * with the same function, so the page and the server can never disagree.
 */
export interface InspirationQueryState {
  q: string;
  types: string[];
  exam: InspirationExam | null;
  by: InspirationBy | null;
  year: number | null;
  sort: InspirationSort;
}

export const EMPTY_QUERY: InspirationQueryState = { q: '', types: [], exam: null, by: null, year: null, sort: 'relevant' };

export const SORT_LABELS: Record<InspirationSort, string> = { relevant: 'Best match', newest: 'Newest', saved: 'Most saved' };

const EXAMS: readonly string[] = ['NATA', 'JEE_PAPER_2'];
const BYS: readonly string[] = ['reference', 'current', 'alumni'];
const SORTS: readonly string[] = ['relevant', 'newest', 'saved'];
const SLUG = /^[a-z0-9_]{2,40}$/;
const MAX_QUERY = 100;
const MAX_TYPES = 6;

export function parseInspirationQuery(search: string): InspirationQueryState {
  const p = new URLSearchParams(search);
  const q = (p.get('q') ?? '').trim().slice(0, MAX_QUERY);
  const types = [...new Set((p.get('type') ?? '').split(',').map((t) => t.trim()).filter((t) => SLUG.test(t)))].slice(0, MAX_TYPES);
  const examRaw = p.get('exam') ?? '';
  const byRaw = p.get('by') ?? '';
  const yearRaw = p.get('year') ?? '';
  const sortRaw = p.get('sort') ?? '';
  const yearNum = Number(yearRaw);
  return {
    q,
    types,
    exam: EXAMS.includes(examRaw) ? (examRaw as InspirationExam) : null,
    by: BYS.includes(byRaw) ? (byRaw as InspirationBy) : null,
    year: /^\d{4}$/.test(yearRaw) && yearNum >= 2000 && yearNum <= 2100 ? yearNum : null,
    sort: SORTS.includes(sortRaw) ? (sortRaw as InspirationSort) : 'relevant',
  };
}

/** For patchQuery: null removes a key, so defaults never clutter the URL. */
export function toQueryPatch(s: InspirationQueryState): Record<string, string | null> {
  return {
    q: s.q || null,
    type: s.types.length ? s.types.join(',') : null,
    exam: s.exam,
    by: s.by,
    year: s.year ? String(s.year) : null,
    sort: s.sort === 'relevant' ? null : s.sort,
  };
}

export function toApiQuery(
  s: InspirationQueryState,
  opts: { offset: number; scope?: InspirationScope; savedOnly?: boolean },
): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(toQueryPatch(s))) {
    if (value !== null) p.set(key, value);
  }
  if (opts.offset > 0) p.set('offset', String(opts.offset));
  if (opts.scope && opts.scope !== 'visible') p.set('scope', opts.scope);
  if (opts.savedOnly) p.set('saved', '1');
  return p.toString();
}

export function parseScope(v: string | null): InspirationScope {
  return v === 'hidden' || v === 'all' ? v : 'visible';
}

export function toFilters(
  s: InspirationQueryState,
  opts: { offset: number; limit: number; scope: InspirationScope; savedOnly: boolean },
): InspirationFilters {
  return {
    query: s.q || undefined,
    types: s.types,
    exam: s.exam ?? undefined,
    by: s.by ?? undefined,
    year: s.year ?? undefined,
    sort: s.sort,
    scope: opts.scope,
    savedOnly: opts.savedOnly,
    limit: opts.limit,
    offset: opts.offset,
  };
}

export function hasActiveFilters(s: InspirationQueryState): boolean {
  return Boolean(s.q || s.types.length || s.exam || s.by || s.year);
}

export interface ChipFacet {
  value: string;
  label: string | null;
  item_count: number;
}

/**
 * Chips to render: selected values first (kept even at zero, so a student can
 * always untick what they ticked), then the biggest, up to `max`.
 */
export function chipsFor(facets: ChipFacet[], selected: string[], max = Number.POSITIVE_INFINITY): ChipFacet[] {
  const byValue = new Map(facets.map((f) => [f.value, f]));
  const chosen = selected.map((v) => byValue.get(v) ?? { value: v, label: null, item_count: 0 });
  const rest = facets
    .filter((f) => !selected.includes(f.value))
    .sort((a, b) => b.item_count - a.item_count || (a.label ?? a.value).localeCompare(b.label ?? b.value));
  return [...chosen, ...rest].slice(0, Math.max(max, chosen.length));
}

const LIST_URL = /^\/(student|teacher)\/inspiration(\/saved)?\/?(\?.*)?$/;

/** Back from an item returns to the results it was opened from, and only those. */
export function pickBackHref(stored: string | null, base: string): string {
  if (stored && stored.startsWith(base) && LIST_URL.test(stored)) return stored;
  return base;
}
