import { describe, it, expect } from 'vitest';
import {
  RESULT_FILTERS,
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
): FilterableRow => ({ status, passed });

const passedStudent = row('submitted', true);
const failedStudent = row('submitted', false);
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

  it('counts only submitted attempts as Did it', () => {
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

  it('reads Below pass as submitted AND failed, never as "not passed"', () => {
    expect(matchesResultFilter(failedStudent, 'below_pass')).toBe(true);
    expect(matchesResultFilter(passedStudent, 'below_pass')).toBe(false);
    // The load-bearing one: somebody who never sat it has passed === null, and
    // sweeping them in here would put the same person under two chips and get
    // them messaged twice.
    expect(matchesResultFilter(neverStarted, 'below_pass')).toBe(false);
    expect(matchesResultFilter(missedIt, 'below_pass')).toBe(false);
  });

  it('never puts one student under both Not done and Below pass', () => {
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

describe('countByResultFilter', () => {
  it('adds up the run on screen', () => {
    const rows: FilterableRow[] = [
      ...Array.from({ length: 11 }, () => passedStudent),
      ...Array.from({ length: 5 }, () => failedStudent),
      ...Array.from({ length: 26 }, () => missedIt),
    ];
    const counts = countByResultFilter(rows);
    expect(counts.all).toBe(42);
    expect(counts.did).toBe(16);
    expect(counts.not_done).toBe(26);
    expect(counts.below_pass).toBe(5);
    expect(counts.passed).toBe(11);
  });

  it('gives every filter a number, even at zero', () => {
    const counts = countByResultFilter([]);
    for (const f of RESULT_FILTERS) expect(counts[f]).toBe(0);
  });

  it('agrees with the rows the same predicate returns', () => {
    const rows = [passedStudent, failedStudent, neverStarted, midway];
    const counts = countByResultFilter(rows);
    for (const f of RESULT_FILTERS) {
      expect(rows.filter((r) => matchesResultFilter(r, f))).toHaveLength(counts[f]);
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

describe('isResultFilter', () => {
  it('accepts the five real filters and refuses a URL someone typed', () => {
    for (const f of RESULT_FILTERS) expect(isResultFilter(f)).toBe(true);
    expect(isResultFilter('below-pass')).toBe(false);
    expect(isResultFilter(undefined)).toBe(false);
  });
});
