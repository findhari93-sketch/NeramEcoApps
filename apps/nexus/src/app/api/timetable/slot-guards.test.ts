import { describe, it, expect } from 'vitest';
import { isSlotInPast } from './slot-guards';

describe('isSlotInPast', () => {
  const now = new Date('2026-08-29T10:00:00+05:30');

  it('flags a date days in the past', () => {
    expect(isSlotInPast('2026-08-26', '19:00', now)).toBe(true);
  });

  it('flags today with a start time already gone by', () => {
    expect(isSlotInPast('2026-08-29', '09:00', now)).toBe(true);
  });

  it('allows today with a start time still ahead', () => {
    expect(isSlotInPast('2026-08-29', '11:00', now)).toBe(false);
  });

  it('allows a future date', () => {
    expect(isSlotInPast('2026-09-01', '19:00', now)).toBe(false);
  });

  it('is not fooled by a browser/server timezone reading a late-evening class as tomorrow', () => {
    // 9 PM IST on the 29th is only 3:30 PM UTC the same day, not the 30th.
    expect(isSlotInPast('2026-08-29', '21:00', now)).toBe(false);
  });
});
