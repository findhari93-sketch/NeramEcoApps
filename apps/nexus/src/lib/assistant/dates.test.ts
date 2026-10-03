import { describe, expect, it } from 'vitest';
import { parseDateRange, parseSingleDate } from './dates';

const today = '2026-10-03'; // a Saturday

describe('parseSingleDate', () => {
  it('reads relative words', () => {
    expect(parseSingleDate('today', today)).toBe('2026-10-03');
    expect(parseSingleDate('tomorrow', today)).toBe('2026-10-04');
    expect(parseSingleDate('day after tomorrow', today)).toBe('2026-10-05');
  });
  it('reads a weekday as the next one', () => {
    expect(parseSingleDate('monday', today)).toBe('2026-10-05');
    expect(parseSingleDate('next friday', today)).toBe('2026-10-09');
    expect(parseSingleDate('on sat', today)).toBe('2026-10-10');
  });
  it('reads day and month, with or without a year', () => {
    expect(parseSingleDate('8 Oct', today)).toBe('2026-10-08');
    expect(parseSingleDate('8th October 2026', today)).toBe('2026-10-08');
    expect(parseSingleDate('2026-10-08', today)).toBe('2026-10-08');
  });
  it('rolls a past day-month into next year', () => {
    expect(parseSingleDate('2 Jan', today)).toBe('2027-01-02');
  });
  it('rejects inherited keys and strips trailing punctuation', () => {
    expect(parseSingleDate('constructor', today)).toBeNull();
    expect(parseSingleDate('8 constructor', today)).toBeNull();
    expect(parseSingleDate('tomorrow?', today)).toBe('2026-10-04');
    expect(parseSingleDate('friday!', today)).toBe('2026-10-09');
  });
  it('returns null for nothing it recognises', () => {
    expect(parseSingleDate('whenever', today)).toBeNull();
  });
});

describe('parseDateRange', () => {
  it('reads "X to Y"', () => {
    expect(parseDateRange('8 Oct to 12 Oct', today)).toEqual({ from: '2026-10-08', to: '2026-10-12' });
    expect(parseDateRange('from tomorrow till friday', today)).toEqual({ from: '2026-10-04', to: '2026-10-09' });
  });
  it('keeps a leave already under way in this year', () => {
    expect(parseDateRange('12 Oct to 2 Oct', today)).toBeNull();
    expect(parseDateRange('1 Oct to 5 Oct', today)).toEqual({ from: '2026-10-01', to: '2026-10-05' });
  });
  it('wraps December to January', () => {
    expect(parseDateRange('28 Dec to 3 Jan', today)).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });
  it('reads "for N days" from today or a start', () => {
    expect(parseDateRange('for 3 days', today)).toEqual({ from: '2026-10-03', to: '2026-10-05' });
    expect(parseDateRange('from monday for 5 days', today)).toEqual({ from: '2026-10-05', to: '2026-10-09' });
  });
  it('reads "next week" as Monday to Sunday', () => {
    expect(parseDateRange('next week', today)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });
  it('reads one date as a one-day range', () => {
    expect(parseDateRange('tomorrow', today)).toEqual({ from: '2026-10-04', to: '2026-10-04' });
  });
  it('returns null when it cannot', () => {
    expect(parseDateRange('some time', today)).toBeNull();
  });
});
