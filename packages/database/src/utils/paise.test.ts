import { describe, it, expect } from 'vitest';
import { toPaise, fromPaise, formatPaise, splitPaise } from './paise';

/** Money in the payments tables is integer paise; these are the only conversions allowed. */
describe('paise', () => {
  it('turns rupees into whole paise without float drift', () => {
    expect(toPaise(25000)).toBe(2500000);
    expect(toPaise(25000.37)).toBe(2500037);
    expect(toPaise('16500.00')).toBe(1650000);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });

  it('treats blanks and garbage as zero', () => {
    expect(toPaise(null)).toBe(0);
    expect(toPaise(undefined)).toBe(0);
    expect(toPaise('abc')).toBe(0);
    expect(toPaise(-5)).toBe(0);
  });

  it('turns paise back into rupees', () => {
    expect(fromPaise(2500037)).toBe(25000.37);
    expect(fromPaise(1350000)).toBe(13500);
  });

  it('formats Indian style, hiding .00', () => {
    expect(formatPaise(2500000)).toBe('₹25,000');
    expect(formatPaise(2500037)).toBe('₹25,000.37');
    expect(formatPaise(150)).toBe('₹1.50');
  });

  it('splits an attempt amount into base and tag', () => {
    expect(splitPaise(2500037)).toEqual({ basePaise: 2500000, tag: 37 });
    expect(splitPaise(2500000)).toEqual({ basePaise: 2500000, tag: 0 });
  });
});
