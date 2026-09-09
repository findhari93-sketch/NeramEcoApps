import { describe, it, expect } from 'vitest';
import {
  resolveCatchupTestState,
  type CatchupTestAttemptRow,
} from './catchup';

/**
 * The regression suite for NXS-0141.
 *
 * A student finished the recap, sat the class test, scored 66.67% against an 85%
 * bar and failed. The fail nulled `test_unlocked_at`, and twenty six seconds
 * later a read-time self-heal put it straight back, because its predicate
 * ("checkpoints complete, nothing unlocked, nothing passed") is exactly the
 * state a fail leaves behind. The student returned to a screen identical to the
 * one before he sat it: no score, no date, nothing.
 *
 * That whole class of bug comes from keeping the answer in a one-shot column
 * written by a side effect. These tests pin the replacement: the attempts ARE
 * the answer, so there is nothing to lose and nothing to reconcile.
 */

const attempt = (over: Partial<CatchupTestAttemptRow> = {}): CatchupTestAttemptRow => ({
  percentage: 90,
  submitted_at: '2026-08-23T09:31:47Z',
  ...over,
});

describe('resolveCatchupTestState', () => {
  it('reports no attempt at all as unsat, not as failed', () => {
    const s = resolveCatchupTestState([], 85, null);
    expect(s.passed).toBe(false);
    expect(s.attemptCount).toBe(0);
    expect(s.lastAttempt).toBeNull();
    expect(s.bestPercentage).toBeNull();
  });

  it('passes on an attempt at or above the bar', () => {
    expect(resolveCatchupTestState([attempt({ percentage: 85 })], 85, null).passed).toBe(true);
    expect(resolveCatchupTestState([attempt({ percentage: 92.5 })], 85, null).passed).toBe(true);
  });

  it('keeps a failing attempt failing, and remembers the score', () => {
    // Yahul's real numbers: 70 of 105.
    const s = resolveCatchupTestState([attempt({ percentage: 66.67 })], 85, null);
    expect(s.passed).toBe(false);
    expect(s.attemptCount).toBe(1);
    expect(s.lastAttempt?.percentage).toBe(66.67);
    expect(s.lastAttempt?.submitted_at).toBe('2026-08-23T09:31:47Z');
  });

  it('fails Abhitha by the one mark she was actually short', () => {
    // 89 of 105 is 84.76%, and the bar is 85%. She sat it twice.
    const s = resolveCatchupTestState(
      [attempt({ percentage: 48.57 }), attempt({ percentage: 84.76 })],
      85,
      null,
    );
    expect(s.passed).toBe(false);
    expect(s.bestPercentage).toBe(84.76);
  });

  it('is idempotent across repeated reads, which is the whole point', () => {
    // The bug was that reading the state CHANGED it. Two reads of the same
    // ledger must agree forever.
    const rows = [attempt({ percentage: 66.67 })];
    const first = resolveCatchupTestState(rows, 85, null);
    const second = resolveCatchupTestState(rows, 85, null);
    expect(second).toEqual(first);
  });

  it('takes the best attempt, not the most recent one', () => {
    // Passing then failing a resit must not un-pass the class.
    const s = resolveCatchupTestState(
      [
        attempt({ percentage: 90, submitted_at: '2026-08-23T09:00:00Z' }),
        attempt({ percentage: 20, submitted_at: '2026-08-24T09:00:00Z' }),
      ],
      85,
      null,
    );
    expect(s.passed).toBe(true);
    expect(s.bestPercentage).toBe(90);
  });

  it('reports the most recent attempt as the one to show', () => {
    const s = resolveCatchupTestState(
      [
        attempt({ percentage: 40, submitted_at: '2026-08-23T09:00:00Z' }),
        attempt({ percentage: 70, submitted_at: '2026-08-24T09:00:00Z' }),
      ],
      85,
      null,
    );
    expect(s.lastAttempt?.percentage).toBe(70);
    expect(s.attemptCount).toBe(2);
  });

  it('treats a null bar as "sitting it is passing it"', () => {
    // Same rule as resolvePassingPct, deliberately.
    expect(resolveCatchupTestState([attempt({ percentage: 1 })], null, null).passed).toBe(true);
  });

  it('ignores an attempt with no percentage recorded', () => {
    const s = resolveCatchupTestState([attempt({ percentage: null })], 85, null);
    expect(s.passed).toBe(false);
    expect(s.attemptCount).toBe(0);
  });

  it('lets a teacher reset wipe the history without touching the ledger', () => {
    // reset_test used to null test_passed_at. With the attempts as the source of
    // truth there is nothing to null, so the reset stamps a line in the sand and
    // everything at or before it stops counting.
    const rows = [attempt({ percentage: 90, submitted_at: '2026-08-23T09:00:00Z' })];
    const s = resolveCatchupTestState(rows, 85, '2026-08-24T00:00:00Z');
    expect(s.passed).toBe(false);
    expect(s.attemptCount).toBe(0);
    expect(s.lastAttempt).toBeNull();
  });

  it('counts an attempt sat after the reset', () => {
    const rows = [
      attempt({ percentage: 90, submitted_at: '2026-08-23T09:00:00Z' }),
      attempt({ percentage: 88, submitted_at: '2026-08-25T09:00:00Z' }),
    ];
    const s = resolveCatchupTestState(rows, 85, '2026-08-24T00:00:00Z');
    expect(s.passed).toBe(true);
    expect(s.attemptCount).toBe(1);
    expect(s.lastAttempt?.percentage).toBe(88);
  });

  it('keeps an attempt with no submitted_at rather than silently dropping it', () => {
    // Grading writes submitted_at, so a missing one is a data oddity, not a
    // reason to tell a student who passed that they did not.
    const s = resolveCatchupTestState([attempt({ percentage: 90, submitted_at: null })], 85, null);
    expect(s.passed).toBe(true);
    expect(s.attemptCount).toBe(1);
  });
});
