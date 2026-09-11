/**
 * The groups a teacher actually acts on, on the Students tab.
 *
 * PURE, so the tile counts and the rows behind them come from one function
 * rather than two. A tile that reads "Not passed 5" and then shows six students
 * is worse than no tile, because the teacher acts on the number.
 *
 * These read fields the results route already sends. Nothing here needs a
 * fetch, which is what makes filter-then-select-all a two-tap path rather than
 * a round trip.
 */

export type ResultFilter = 'all' | 'did' | 'not_done' | 'passed' | 'below_pass' | 'below_avg';

/** In tile order. */
export const RESULT_FILTERS: ResultFilter[] = ['all', 'did', 'not_done', 'passed', 'below_pass', 'below_avg'];

export const RESULT_FILTER_LABELS: Record<ResultFilter, string> = {
  all: 'Everyone',
  did: 'Done',
  not_done: 'Not done',
  passed: 'Passed',
  below_pass: 'Not passed',
  below_avg: 'Below average',
};

/** What each tile means, for the empty state when it matches nobody. */
export const RESULT_FILTER_EMPTY: Record<ResultFilter, string> = {
  all: 'Nobody is on this run yet.',
  did: 'Nobody has sat this yet.',
  not_done: 'Everybody has sat this one.',
  passed: 'Nobody has passed it yet.',
  below_pass: 'Nobody who sat it is below the pass mark.',
  below_avg: 'Nobody who sat it is below the class average.',
};

export interface FilterableRow {
  status: 'submitted' | 'in_progress' | 'not_started' | 'missed' | 'excused';
  passed: boolean | null;
  first_percentage?: number | null;
  best_percentage?: number | null;
}

/**
 * What "below average" is measured against.
 *
 * It follows the First/Best toggle, both sides: the class average of first
 * attempts against each student's first attempt, or best against best. Mixing
 * them would call a student who improved "below average" on a number nobody
 * on screen is looking at.
 */
export interface ResultFilterContext {
  average: number | null;
  scoreShown: 'first' | 'best';
}

export function isResultFilter(v: unknown): v is ResultFilter {
  return typeof v === 'string' && (RESULT_FILTERS as string[]).includes(v);
}

/**
 * Whether one student belongs in one group.
 *
 * 'not_done' deliberately covers both not_started and missed. A teacher chasing
 * people does not care which side of the deadline they stopped on, and making
 * them tick two tiles to reach one group is how the whole feature gets ignored.
 *
 * 'below_pass' (shown as Not passed) is submitted-and-failed, never "has not
 * passed". Somebody who never sat it has passed === null and belongs in
 * 'not_done'; sweeping them in here would put the same person under two tiles
 * and message them twice. 'below_avg' holds to the same rule.
 */
export function matchesResultFilter(
  row: FilterableRow,
  filter: ResultFilter,
  ctx?: ResultFilterContext,
): boolean {
  switch (filter) {
    case 'did':
      return row.status === 'submitted';
    case 'not_done':
      return row.status === 'not_started' || row.status === 'missed';
    case 'passed':
      return row.passed === true;
    case 'below_pass':
      return row.status === 'submitted' && row.passed === false;
    case 'below_avg': {
      if (row.status !== 'submitted' || !ctx || ctx.average == null) return false;
      const pct = ctx.scoreShown === 'first' ? row.first_percentage : row.best_percentage;
      return pct != null && Number(pct) < ctx.average;
    }
    case 'all':
    default:
      return true;
  }
}

export function countByResultFilter<T extends FilterableRow>(
  rows: T[],
  ctx?: ResultFilterContext,
): Record<ResultFilter, number> {
  const out = {} as Record<ResultFilter, number>;
  for (const filter of RESULT_FILTERS) {
    out[filter] = rows.filter((r) => matchesResultFilter(r, filter, ctx)).length;
  }
  return out;
}

/**
 * Which groups match anybody at all.
 *
 * 'all' always stays. The tiles use this to show an empty group as disabled
 * rather than as a live button that opens onto nobody.
 */
export function visibleResultFilters(counts: Record<ResultFilter, number>): ResultFilter[] {
  return RESULT_FILTERS.filter((f) => f === 'all' || counts[f] > 0);
}
