import { describe, it, expect } from 'vitest';
import { isSamePhone } from './phone-match';

describe('isSamePhone', () => {
  it('matches the token claim against the submitted number in any common shape', () => {
    expect(isSamePhone('+919949414949', '+919949414949')).toBe(true);
    expect(isSamePhone('+919949414949', '99494 14949')).toBe(true);
    expect(isSamePhone('+919949414949', '09949414949')).toBe(true);
  });

  it('rejects a different number, a missing claim, or a short number', () => {
    expect(isSamePhone('+919949414949', '+919949414948')).toBe(false);
    expect(isSamePhone(undefined, '+919949414949')).toBe(false);
    expect(isSamePhone('+91994', '+91994')).toBe(false);
  });
});
