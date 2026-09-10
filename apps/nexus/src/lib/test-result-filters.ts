/**
 * The five groups a teacher actually acts on, on the results tab.
 *
 * PURE, so the chip counts and the rows behind them come from one function
 * rather than two. A chip that reads "Below pass 5" and then shows six students
 * is worse than no chip, because the teacher acts on the number.
 *
 * These read fields the results route already sends. Nothing here needs a
 * fetch, which is what makes filter-then-select-all a two-tap path rather than
 * a round trip.
 */

export type ResultFilter = 'all' | 'did' | 'not_done' | 'below_pass' | 'passed';

export const RESULT_FILTERS: ResultFilter[] = ['all', 'did', 'not_done', 'below_pass', 'passed'];

export const RESULT_FILTER_LABELS: Record<ResultFilter, string> = {
  all: 'Everyone',
  did: 'Did it',
  not_done: 'Not done',
  below_pass: 'Below pass',
  passed: 'Passed',
};

/** What each chip means, for the empty state when it matches nobody. */
export const RESULT_FILTER_EMPTY: Record<ResultFilter, string> = {
  all: 'Nobody is on this run yet.',
  did: 'Nobody has sat this yet.',
  not_done: 'Everybody has sat this one.',
  below_pass: 'Nobody who sat it is below the pass mark.',
  passed: 'Nobody has passed it yet.',
};

export interface FilterableRow {
  status: 'submitted' | 'in_progress' | 'not_started' | 'missed' | 'excused';
  passed: boolean | null;
}

export function isResultFilter(v: unknown): v is ResultFilter {
  return typeof v === 'string' && (RESULT_FILTERS as string[]).includes(v);
}

/**
 * Whether one student belongs in one group.
 *
 * 'not_done' deliberately covers both not_started and missed. A teacher chasing
 * people does not care which side of the deadline they stopped on, and making
 * them tick two chips to reach one group is how the whole feature gets ignored.
 *
 * 'below_pass' is submitted-and-failed, never "not passed". Somebody who never
 * sat it has passed === null and belongs in 'not_done'; sweeping them in here
 * would put the same person under two chips and double-message them.
 */
export function matchesResultFilter(row: FilterableRow, filter: ResultFilter): boolean {
  switch (filter) {
    case 'did':
      return row.status === 'submitted';
    case 'not_done':
      return row.status === 'not_started' || row.status === 'missed';
    case 'below_pass':
      return row.status === 'submitted' && row.passed === false;
    case 'passed':
      return row.passed === true;
    case 'all':
    default:
      return true;
  }
}

export function countByResultFilter<T extends FilterableRow>(
  rows: T[],
): Record<ResultFilter, number> {
  const out = { all: 0, did: 0, not_done: 0, below_pass: 0, passed: 0 } as Record<
    ResultFilter,
    number
  >;
  for (const filter of RESULT_FILTERS) {
    out[filter] = rows.filter((r) => matchesResultFilter(r, filter)).length;
  }
  return out;
}

/**
 * Which chips are worth showing at all.
 *
 * 'all' always stays. An empty group is dropped rather than shown as a zero,
 * because a row of zeroes teaches a teacher that the chips are decoration.
 */
export function visibleResultFilters(counts: Record<ResultFilter, number>): ResultFilter[] {
  return RESULT_FILTERS.filter((f) => f === 'all' || counts[f] > 0);
}
