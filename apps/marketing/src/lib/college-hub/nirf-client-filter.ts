/**
 * In-browser filtering for /colleges/rankings/nirf.
 *
 * The page used to read searchParams on the server, so the "revalidate = 86400"
 * never applied: every view rendered on demand and every filter combination
 * wrote its own Data Cache entry. The whole architecture table is small (about
 * 170 rows across all years), so the page now ships every row once and this
 * module applies the URL filters with the meaning the database query had
 * (packages/database/src/queries/nirf-rankings.ts getNIRFRankings).
 */
import type { NIRFRankingWithCollege } from '@neram/database';
import type { NIRFFilters } from './nirf-filters';

const PUBLIC_FIELDS = [
  'id',
  'college_id',
  'year',
  'rank',
  'score',
  'tlr',
  'rpc',
  'go',
  'oi',
  'pr',
  'source_name',
  'source_city',
  'source_state',
  'college',
] as const;

export type PublicNIRFRow = Pick<NIRFRankingWithCollege, (typeof PUBLIC_FIELDS)[number]>;

/** Only the fields the table, cards, compare view and stats read. */
export function toPublicNIRFRow(r: NIRFRankingWithCollege): PublicNIRFRow {
  const out = {} as Record<string, unknown>;
  for (const k of PUBLIC_FIELDS) out[k] = r[k];
  return out as PublicNIRFRow;
}

function nullsLast(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export function applyNIRFFilters<T extends PublicNIRFRow>(
  rows: readonly T[],
  filters: NIRFFilters,
  latestYear: number | undefined,
): { data: T[]; count: number } {
  const years = filters.compare ? [] : filters.years.length ? filters.years : latestYear ? [latestYear] : [];
  const needle = filters.search?.toLowerCase();
  const state = filters.state?.toLowerCase();
  const city = filters.city?.toLowerCase();
  const type = filters.type?.toLowerCase();

  const data = rows.filter((r) => {
    if (years.length && !years.includes(r.year)) return false;
    if (filters.rankMin !== undefined && r.rank < filters.rankMin) return false;
    if (filters.rankMax !== undefined && r.rank > filters.rankMax) return false;
    if (filters.scoreMin !== undefined && (r.score == null || r.score < filters.scoreMin)) return false;
    if (filters.scoreMax !== undefined && (r.score == null || r.score > filters.scoreMax)) return false;
    if (state && r.college?.state_slug !== filters.state && r.college?.state?.toLowerCase() !== state) return false;
    if (city && r.college?.city?.toLowerCase() !== city) return false;
    if (type && r.college?.type?.toLowerCase() !== type) return false;
    if (needle) {
      const hay = [r.source_name, r.source_city, r.source_state, r.college?.name, r.college?.short_name, r.college?.city, r.college?.state]
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  if (filters.sort === 'score_desc') data.sort((a, b) => nullsLast(a.score, b.score, -1));
  else if (filters.sort === 'name_asc') data.sort((a, b) => (a.source_name < b.source_name ? -1 : a.source_name > b.source_name ? 1 : 0));
  else data.sort((a, b) => b.year - a.year || a.rank - b.rank);

  return { data, count: data.length };
}

export function nirfHeroStats(rows: readonly PublicNIRFRow[], year: number) {
  const yearRows = rows.filter((r) => r.year === year);
  const topScore = yearRows.reduce<number | null>((acc, r) => (r.score === null ? acc : acc === null || r.score > acc ? r.score : acc), null);
  return {
    institutionsRanked: new Set(yearRows.map((r) => r.college_id)).size,
    topScore,
    statesCovered: new Set(yearRows.map((r) => r.college?.state).filter(Boolean)).size,
    govt: yearRows.filter((r) => r.college?.type?.toLowerCase() === 'government').length,
    privateCount: yearRows.filter((r) => r.college?.type?.toLowerCase() === 'private').length,
  };
}
