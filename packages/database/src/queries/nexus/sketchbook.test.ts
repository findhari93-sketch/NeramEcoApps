import { describe, it, expect } from 'vitest';
import { monthRangeIst } from './sketchbook';

describe('monthRangeIst', () => {
  it('bounds a month in IST, not UTC', () => {
    expect(monthRangeIst('2026-09')).toEqual({
      from: '2026-09-01T00:00:00+05:30',
      to: '2026-10-01T00:00:00+05:30',
    });
  });
  it('rolls December into the next year', () => {
    expect(monthRangeIst('2026-12').to).toBe('2027-01-01T00:00:00+05:30');
  });
});
