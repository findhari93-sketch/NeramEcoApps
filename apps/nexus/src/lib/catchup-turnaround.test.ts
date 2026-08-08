/**
 * The guard on one sentence being written once.
 *
 * "28 days later" is now printed on two screens that are reached from different
 * places: the standing tab, where it reads as history, and the attendance panel
 * for a single class, where it reads as a review of how quickly the people who
 * missed that class came back. Two copies of a rounding rule would eventually
 * put a different number in each, and there is no way for a teacher looking at
 * one screen to know the other disagrees.
 */
import { describe, it, expect } from 'vitest';
import { daysBetween, turnaround } from './catchup-turnaround';

describe('daysBetween', () => {
  it('counts whole IST days, so an evening class keeps its own date', () => {
    // A class on the 10th cleared late on the 12th is two days, not one and a
    // bit. Both ends are pinned to IST midnight before subtracting.
    expect(daysBetween('2026-07-10', '2026-07-12T22:30:00+05:30')).toBe(2);
  });

  it('floors at zero rather than going negative', () => {
    // A clock skew or a backdated write must not print "-1 days later".
    expect(daysBetween('2026-07-10', '2026-07-08T10:00:00Z')).toBe(0);
  });

  it('returns 0 for unparseable input instead of NaN', () => {
    expect(daysBetween('not-a-date', '2026-07-12T10:00:00Z')).toBe(0);
  });
});

describe('turnaround', () => {
  it('says same day, the next day, then counts', () => {
    expect(turnaround('2026-07-10', '2026-07-10T19:00:00+05:30')).toBe('same day');
    expect(turnaround('2026-07-10', '2026-07-11T09:00:00+05:30')).toBe('the next day');
    expect(turnaround('2026-07-10', '2026-08-07T09:00:00+05:30')).toBe('28 days later');
  });

  it('is empty when nothing was cleared, so no caller has to guard', () => {
    // Both screens interpolate this straight into a sentence. Returning "0 days
    // later" for an unfinished class would read as finished.
    expect(turnaround('2026-07-10', null)).toBe('');
  });
});
