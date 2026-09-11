import { describe, it, expect } from 'vitest';
import {
  RESULT_FILTERS,
  RESULT_FILTER_LABELS,
  countByResultFilter,
  isResultFilter,
  matchesResultFilter,
  visibleResultFilters,
  type FilterableRow,
} from './test-result-filters';

/** The run from the screenshot: 16 of 42 done, 26 not, pass mark 80, 11 passed. */
const row = (
  status: FilterableRow['status'],
  passed: boolean | null,
  first: number | null = null,
  best: number | null = first,
): FilterableRow => ({ status, passed, first_percentage: first, best_percentage: best });

const passedStudent = row('submitted', true, 90);
const failedStudent = row('submitted', false, 60);
const neverStarted = row('not_started', null);
const missedIt = row('missed', null);
const notRequired = row('excused', null);
const midway = row('in_progress', null);

describe('matchesResultFilter', () => {
  it('puts everyone under Everyone', () => {
    for (const r of [passedStudent, failedStudent, neverStarted, missedIt, notRequired, midway]) {
      expect(matchesResultFilter(r, 'all')).toBe(true);
    }
  });

  it('counts only submitted attempts as Done', () => {
    expect(matchesResultFilter(passedStudent, 'did')).toBe(true);
    expect(matchesResultFilter(failedStudent, 'did')).toBe(true);
    expect(matchesResultFilter(midway, 'did')).toBe(false);
    expect(matchesResultFilter(neverStarted, 'did')).toBe(false);
  });

  it('folds not started and missed into one Not done group', () => {
    expect(matchesResultFilter(neverStarted, 'not_done')).toBe(true);
    expect(matchesResultFilter(missedIt, 'not_done')).toBe(true);
  });

  it('leaves an in-progress attempt out of Not done', () => {
    // They are sitting it right now. Chasing them mid-paper is the one message
    // guaranteed to be wrong.
    expect(matchesResultFilter(midway, 'not_done')).toBe(false);
  });

  it('leaves an excused student out of Not done', () => {
    expect(matchesResultFilter(notRequired, 'not_done')).toBe(false);
  });

  it('reads Not passed as submitted AND failed, never as "has not passed"', () => {
    expect(matchesResultFilter(failedStudent, 'below_pass')).toBe(true);
    expect(matchesResultFilter(passedStudent, 'below_pass')).toBe(false);
    // The load-bearing one: somebody who never sat it has passed === null, and
    // sweeping them in here would put the same person under two tiles and get
    // them messaged twice.
    expect(matchesResultFilter(neverStarted, 'below_pass')).toBe(false);
    expect(matchesResultFilter(missedIt, 'below_pass')).toBe(false);
  });

  it('never puts one student under both Not done and Not passed', () => {
    for (const r of [passedStudent, failedStudent, neverStarted, missedIt, notRequired, midway]) {
      expect(matchesResultFilter(r, 'not_done') && matchesResultFilter(r, 'below_pass')).toBe(false);
    }
  });

  it('reads Passed straight off the flag', () => {
    expect(matchesResultFilter(passedStudent, 'passed')).toBe(true);
    expect(matchesResultFilter(failedStudent, 'passed')).toBe(false);
    expect(matchesResultFilter(neverStarted, 'passed')).toBe(false);
  });
});

describe('Below average', () => {
  // First attempt 60, then improved to 95 on a retake.
  const improver = row('submitted', true, 60, 95);

  it('measures the score the teacher is looking at, first against first and best against best', () => {
    expect(matchesResultFilter(improver, 'below_avg', { average: 77, scoreShown: 'first' })).toBe(true);
    expect(matchesResultFilter(improver, 'below_avg', { average: 85, scoreShown: 'best' })).toBe(false);
  });

  it('never includes somebody who did not sit it', () => {
    const ctx = { average: 77, scoreShown: 'best' as const };
    expect(matchesResultFilter(neverStarted, 'below_avg', ctx)).toBe(false);
    expect(matchesResultFilter(missedIt, 'below_avg', ctx)).toBe(false);
    expect(matchesResultFilter(midway, 'below_avg', ctx)).toBe(false);
  });

  it('holds nobody when there is no average to be below', () => {
    expect(matchesResultFilter(failedStudent, 'below_avg')).toBe(false);
    expect(matchesResultFilter(failedStudent, 'below_avg', { average: null, scoreShown: 'best' })).toBe(false);
  });

  it('is strictly below, so a student exactly on the average is not chased', () => {
    const onAverage = row('submitted', false, 77);
    expect(matchesResultFilter(onAverage, 'below_avg', { average: 77, scoreShown: 'first' })).toBe(false);
  });
});

describe('countByResultFilter', () => {
  it('adds up the run on screen', () => {
    const rows: FilterableRow[] = [
      ...Array.from({ length: 11 }, () => passedStudent),
      ...Array.from({ length: 5 }, () => failedStudent),
      ...Array.from({ length: 26 }, () => missedIt),
    ];
    const counts = countByResultFilter(rows, { average: 77, scoreShown: 'first' });
    expect(counts.all).toBe(42);
    expect(counts.did).toBe(16);
    expect(counts.not_done).toBe(26);
    expect(counts.below_pass).toBe(5);
    expect(counts.passed).toBe(11);
    expect(counts.below_avg).toBe(5);
  });

  it('gives every filter a number, even at zero', () => {
    const counts = countByResultFilter([]);
    for (const f of RESULT_FILTERS) expect(counts[f]).toBe(0);
  });

  it('agrees with the rows the same predicate returns', () => {
    const rows = [passedStudent, failedStudent, neverStarted, midway];
    const ctx = { average: 70, scoreShown: 'best' as const };
    const counts = countByResultFilter(rows, ctx);
    for (const f of RESULT_FILTERS) {
      expect(rows.filter((r) => matchesResultFilter(r, f, ctx))).toHaveLength(counts[f]);
    }
  });
});

describe('visibleResultFilters', () => {
  it('drops the groups that match nobody', () => {
    const counts = countByResultFilter([passedStudent, passedStudent]);
    expect(visibleResultFilters(counts)).toEqual(['all', 'did', 'passed']);
  });

  it('always keeps Everyone, even with no rows at all', () => {
    expect(visibleResultFilters(countByResultFilter([]))).toEqual(['all']);
  });
});

describe('labels and URL values', () => {
  it('calls the groups what the teacher calls them', () => {
    expect(RESULT_FILTER_LABELS.did).toBe('Done');
    expect(RESULT_FILTER_LABELS.below_pass).toBe('Not passed');
    expect(RESULT_FILTER_LABELS.below_avg).toBe('Below average');
  });

  it('accepts the real filters and refuses a URL someone typed', () => {
    for (const f of RESULT_FILTERS) expect(isResultFilter(f)).toBe(true);
    // Links shared before the rename still say below_pass, and must still work.
    expect(isResultFilter('below_pass')).toBe(true);
    expect(isResultFilter('below-pass')).toBe(false);
    expect(isResultFilter(undefined)).toBe(false);
  });
});
