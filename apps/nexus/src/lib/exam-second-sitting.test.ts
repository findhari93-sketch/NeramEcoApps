import { describe, expect, it } from 'vitest';
import { willRankInSecondSitting } from './exam-second-sitting';

/**
 * This is the riskiest line in the whole feature: a false positive tells a
 * punctual student they will be ranked with the second sitting, which is the
 * opposite of what this feature exists to say. Every boundary here is
 * deliberate, not incidental.
 */
describe('willRankInSecondSitting', () => {
  it('is false without a reopen, even when the dates would otherwise qualify', () => {
    expect(
      willRankInSecondSitting({
        is_reopen: false,
        opens_at: '2026-08-21T00:00:00Z',
        exam_closes_at: '2026-08-20T07:30:00Z',
      }),
    ).toBe(false);
  });

  it('is false when the personal window opens at the exact instant the exam closes', () => {
    // A window opening exactly when exam day ends is not late. The comparison
    // must be a strict "after", never "on or after".
    expect(
      willRankInSecondSitting({
        is_reopen: true,
        opens_at: '2026-08-20T07:30:00Z',
        exam_closes_at: '2026-08-20T07:30:00Z',
      }),
    ).toBe(false);
  });

  it('is true the moment the personal window opens after the exam has closed', () => {
    expect(
      willRankInSecondSitting({
        is_reopen: true,
        opens_at: '2026-08-20T07:30:00.001Z',
        exam_closes_at: '2026-08-20T07:30:00.000Z',
      }),
    ).toBe(true);
  });

  it('is false when opens_at is missing', () => {
    expect(
      willRankInSecondSitting({ is_reopen: true, opens_at: null, exam_closes_at: '2026-08-20T07:30:00Z' }),
    ).toBe(false);
  });

  it('is false when exam_closes_at is missing', () => {
    expect(
      willRankInSecondSitting({ is_reopen: true, opens_at: '2026-08-21T00:00:00Z', exam_closes_at: null }),
    ).toBe(false);
  });

  /**
   * A MAKE-UP IS A DOOR LIKE ANY OTHER.
   *
   * This returned false for anything that was not a reopen, so a make-up window
   * scheduled after the exam's close warned the student about nothing, while
   * examSittingFor ranked their paper `second` all the same: it reads started_at
   * and never looks at which door opened. Production held 2 live make-ups among
   * the 28 students with open windows, each of whom would have learned they were
   * in a separate list only after sitting it.
   */
  describe('a make-up counts exactly as a reopen does', () => {
    it('is true for a make-up window scheduled after the exam closed', () => {
      expect(
        willRankInSecondSitting({
          is_reopen: false,
          is_makeup: true,
          opens_at: '2026-08-22T04:30:00Z',
          exam_closes_at: '2026-08-20T07:30:00Z',
        }),
      ).toBe(true);
    });

    it('is false for a make-up that still lands before the exam closes', () => {
      expect(
        willRankInSecondSitting({
          is_reopen: false,
          is_makeup: true,
          opens_at: '2026-08-20T05:00:00Z',
          exam_closes_at: '2026-08-20T07:30:00Z',
        }),
      ).toBe(false);
    });

    it('is false for a make-up opening at the exact instant the exam closes', () => {
      expect(
        willRankInSecondSitting({
          is_reopen: false,
          is_makeup: true,
          opens_at: '2026-08-20T07:30:00Z',
          exam_closes_at: '2026-08-20T07:30:00Z',
        }),
      ).toBe(false);
    });

    it('is false for the shared window, which is neither a make-up nor a reopen', () => {
      expect(
        willRankInSecondSitting({
          is_reopen: false,
          is_makeup: false,
          opens_at: '2026-08-21T00:00:00Z',
          exam_closes_at: '2026-08-20T07:30:00Z',
        }),
      ).toBe(false);
    });
  });
});
