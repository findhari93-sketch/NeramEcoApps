/**
 * Unit tests for the chronic-non-completion rule.
 *
 * This is the decision that ends with a teacher contacting a parent, so the
 * boundaries matter more here than anywhere else in the feature. 4 of 6 flags,
 * 4 of 7 does not, and neither number should move without someone meaning it.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateChronicPrework,
  preworkWindowStart,
  PREWORK_WINDOW_DAYS,
  PREWORK_MIN_MISSES,
  PREWORK_MIN_RATE,
} from './prework-chronic';

const base = { misses: 0, applicable: 0, explained: 0, submitted: 0, startedClaims: 0 };

describe('evaluateChronicPrework thresholds', () => {
  it('does not flag below the absolute floor, however bad the rate', () => {
    // 3 of 3 is a 100% miss rate and still not enough to call anyone's parent.
    expect(evaluateChronicPrework({ ...base, misses: 3, applicable: 3 }).flagged).toBe(false);
    expect(evaluateChronicPrework({ ...base, misses: 3, applicable: 4 }).flagged).toBe(false);
  });

  it('flags 4 of 6, the smallest case a teacher can say out loud', () => {
    expect(evaluateChronicPrework({ ...base, misses: 4, applicable: 6 }).flagged).toBe(true);
  });

  it('does NOT flag 4 of 7, the rate boundary', () => {
    // 0.6 x 7 = 4.2, and 4 < 4.2.
    expect(evaluateChronicPrework({ ...base, misses: 4, applicable: 7 }).flagged).toBe(false);
  });

  it('flags a student missing everything', () => {
    expect(evaluateChronicPrework({ ...base, misses: 6, applicable: 6 }).flagged).toBe(true);
  });

  it('does not flag a student who is mostly doing the work', () => {
    expect(evaluateChronicPrework({ ...base, misses: 4, applicable: 11, submitted: 7 }).flagged).toBe(false);
  });

  it('never divides by zero when no prework fell due', () => {
    const r = evaluateChronicPrework({ ...base, misses: 0, applicable: 0 });
    expect(r.flagged).toBe(false);
    expect(r.rate).toBe(0);
    expect(Number.isFinite(r.rate)).toBe(true);
  });

  it('counts explained misses too: a reason is not a substitute for the work', () => {
    const r = evaluateChronicPrework({ ...base, misses: 4, applicable: 6, explained: 4 });
    expect(r.flagged).toBe(true);
    expect(r.notes).toContain('Gave a reason every time');
  });

  it('exposes the rate it decided on', () => {
    expect(evaluateChronicPrework({ ...base, misses: 3, applicable: 6 }).rate).toBeCloseTo(0.5);
  });
});

describe('the label and notes a teacher reads', () => {
  it('states the case in plain numbers', () => {
    expect(evaluateChronicPrework({ ...base, misses: 4, applicable: 6 }).label).toBe(
      '4 of 6 missed in the last 4 weeks',
    );
  });

  it('flags repeated "nearly done" claims without letting them trigger on their own', () => {
    const claimsOnly = evaluateChronicPrework({ ...base, misses: 1, applicable: 8, startedClaims: 5 });
    expect(claimsOnly.flagged).toBe(false);
    expect(claimsOnly.notes.some((n) => n.includes('nearly done'))).toBe(true);
  });

  it('does not add the claims note below the threshold', () => {
    const r = evaluateChronicPrework({ ...base, misses: 4, applicable: 6, startedClaims: 2 });
    expect(r.notes.some((n) => n.includes('nearly done'))).toBe(false);
  });

  it('says when a student never explained', () => {
    const r = evaluateChronicPrework({ ...base, misses: 4, applicable: 6, explained: 0 });
    expect(r.notes).toContain('Never said why');
  });

  it('says nothing either way when only some were explained', () => {
    const r = evaluateChronicPrework({ ...base, misses: 4, applicable: 6, explained: 2 });
    expect(r.notes).not.toContain('Never said why');
    expect(r.notes).not.toContain('Gave a reason every time');
  });

  it('never contains an em dash or a double dash', () => {
    const r = evaluateChronicPrework({ ...base, misses: 4, applicable: 6, explained: 4, startedClaims: 3 });
    const text = [r.label, ...r.notes].join(' ');
    expect(text).not.toContain('—');
    expect(text).not.toContain('--');
  });
});

describe('preworkWindowStart', () => {
  it('goes back exactly the window, in IST', () => {
    expect(preworkWindowStart('2026-07-29')).toBe('2026-07-01');
    expect(PREWORK_WINDOW_DAYS).toBe(28);
  });

  it('crosses a month boundary correctly', () => {
    expect(preworkWindowStart('2026-03-10')).toBe('2026-02-10');
  });

  it('crosses a year boundary correctly', () => {
    expect(preworkWindowStart('2026-01-15')).toBe('2025-12-18');
  });
});

describe('the constants themselves', () => {
  it('are the values the rule was defended with', () => {
    expect(PREWORK_MIN_MISSES).toBe(4);
    expect(PREWORK_MIN_RATE).toBe(0.6);
  });
});
