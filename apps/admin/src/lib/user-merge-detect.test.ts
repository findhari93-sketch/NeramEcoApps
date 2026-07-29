import { describe, it, expect } from 'vitest';
import { phoneKey, phoneVariants } from './user-merge-detect';

/**
 * Duplicate detection pairs two `users` rows by a shared phone. The comparison key
 * is the last 10 digits so that the same number stored as "+919949414949",
 * "9949414949" or "99494 14949" still pairs. Regression: the Chetana duplicate,
 * 2026-07-28, where neither row could be paired at all.
 */
describe('phoneKey', () => {
  it('reduces every stored shape of one number to the same key', () => {
    const expected = '9949414949';
    expect(phoneKey('+919949414949')).toBe(expected);
    expect(phoneKey('919949414949')).toBe(expected);
    expect(phoneKey('09949414949')).toBe(expected);
    expect(phoneKey('9949414949')).toBe(expected);
    expect(phoneKey('99494 14949')).toBe(expected);
    expect(phoneKey('+91 99494-14949')).toBe(expected);
  });

  it('ignores values too short to identify a person', () => {
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey('')).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey(undefined)).toBeNull();
  });

  it('keeps distinct numbers distinct', () => {
    expect(phoneKey('+919949414949')).not.toBe(phoneKey('+918925530367'));
  });
});

describe('phoneVariants', () => {
  it('covers the shapes the number may be stored as', () => {
    const variants = phoneVariants('9949414949');
    expect(variants).toContain('9949414949');
    expect(variants).toContain('+919949414949');
    expect(variants).toContain('919949414949');
    expect(variants).toContain('09949414949');
  });

  it('produces no duplicates or empty entries', () => {
    const variants = phoneVariants('9949414949');
    expect(new Set(variants).size).toBe(variants.length);
    expect(variants.every((v) => v.length > 0)).toBe(true);
  });
});
