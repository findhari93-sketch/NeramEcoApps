import { describe, it, expect } from 'vitest';
import {
  derivePassed,
  defaultPassingPct,
  summariseTests,
  CLASS_PREP_DEFAULT_PASSING_PCT,
  CATCHUP_DEFAULT_PASSING_PCT,
} from './parent-tests';
import type { ParentTestDetail } from './parent-view-types';

function test_(over: Partial<ParentTestDetail> = {}): ParentTestDetail {
  return {
    testId: 't1',
    title: 'Class test',
    kind: 'class_prep',
    passingPct: 70,
    attempts: 1,
    bestPct: 80,
    bestScore: 8,
    totalMarks: 10,
    passed: true,
    lastAttemptAt: '2026-07-20T10:00:00Z',
    aggregate: null,
    ...over,
  };
}

describe('derivePassed', () => {
  it('passes a score exactly on the pass mark', () => {
    // >= not >, matching the grader in queries/nexus/class-prep.ts. Getting this
    // backwards would show a child as failed to their parent and passed to their
    // teacher on the very same attempt.
    expect(derivePassed(70, 70, 1)).toBe(true);
  });

  it('fails a score one point under', () => {
    expect(derivePassed(69, 70, 1)).toBe(false);
  });

  it('returns null when the test was never attempted', () => {
    // NOT false. A child who has not sat a test has not failed it.
    expect(derivePassed(null, 70, 0)).toBeNull();
    expect(derivePassed(80, 70, 0)).toBeNull();
  });

  it('returns null when attempted but no percentage was stored', () => {
    expect(derivePassed(null, 70, 2)).toBeNull();
  });

  it('treats a genuine zero as a real, failing score', () => {
    // Distinct from the null case above: they sat it and scored nothing.
    expect(derivePassed(0, 70, 1)).toBe(false);
  });
});

describe('defaultPassingPct', () => {
  it('uses 70 for a class prep test', () => {
    expect(defaultPassingPct('class_prep_test')).toBe(CLASS_PREP_DEFAULT_PASSING_PCT);
    expect(CLASS_PREP_DEFAULT_PASSING_PCT).toBe(70);
  });

  it('uses 85 for a catch-up class test', () => {
    expect(defaultPassingPct('catchup_class')).toBe(CATCHUP_DEFAULT_PASSING_PCT);
    expect(CATCHUP_DEFAULT_PASSING_PCT).toBe(85);
  });

  it('falls back to the prep mark for anything unexpected', () => {
    expect(defaultPassingPct('something_new')).toBe(70);
  });
});

describe('summariseTests', () => {
  it('counts only attempted tests towards the average', () => {
    const s = summariseTests([
      test_({ bestPct: 80, attempts: 1 }),
      test_({ bestPct: 60, attempts: 1 }),
      test_({ bestPct: null, attempts: 0, passed: null }),
    ]);
    expect(s.total).toBe(3);
    expect(s.attempted).toBe(2);
    expect(s.averageBestPct).toBe(70);
  });

  it('returns a null average when nothing has been attempted', () => {
    // An average of no scores is not 0. A 0% on a parent's screen reads as a
    // failing child rather than an untaken test.
    const s = summariseTests([
      test_({ attempts: 0, bestPct: null, passed: null }),
      test_({ attempts: 0, bestPct: null, passed: null }),
    ]);
    expect(s.attempted).toBe(0);
    expect(s.averageBestPct).toBeNull();
    expect(s.passed).toBe(0);
  });

  it('handles an empty list without dividing by zero', () => {
    expect(summariseTests([])).toEqual({
      total: 0,
      attempted: 0,
      passed: 0,
      averageBestPct: null,
    });
  });

  it('counts a genuine zero score in the average', () => {
    const s = summariseTests([
      test_({ bestPct: 0, attempts: 1, passed: false }),
      test_({ bestPct: 100, attempts: 1, passed: true }),
    ]);
    expect(s.averageBestPct).toBe(50);
    expect(s.passed).toBe(1);
  });

  it('does not count a null-passed test as passed', () => {
    const s = summariseTests([test_({ attempts: 0, passed: null, bestPct: null })]);
    expect(s.passed).toBe(0);
  });
});
