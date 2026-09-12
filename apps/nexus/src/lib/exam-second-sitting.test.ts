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
});
