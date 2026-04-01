/**
 * Unit tests for timetable time formatting utilities.
 * Tests formatTimeCompact - the compact time display used in redesigned ClassCard.
 */
import { describe, it, expect } from 'vitest';
import { formatTimeCompact } from './time-utils';

describe('formatTimeCompact', () => {
  // ─── Same AM/PM period: omit AM/PM on start ───

  it('AM to AM: omits AM on start time', () => {
    expect(formatTimeCompact('09:00', '10:30')).toBe('9:00 - 10:30 AM');
  });

  it('PM to PM: omits PM on start time', () => {
    expect(formatTimeCompact('14:00', '15:30')).toBe('2:00 - 3:30 PM');
  });

  it('early morning AM to AM', () => {
    expect(formatTimeCompact('06:00', '07:00')).toBe('6:00 - 7:00 AM');
  });

  it('late evening PM to PM', () => {
    expect(formatTimeCompact('20:00', '21:30')).toBe('8:00 - 9:30 PM');
  });

  // ─── Different AM/PM periods: show both ───

  it('AM to PM: shows both periods', () => {
    expect(formatTimeCompact('11:30', '12:30')).toBe('11:30 AM - 12:30 PM');
  });

  it('PM to AM (overnight): shows both periods', () => {
    expect(formatTimeCompact('23:00', '00:30')).toBe('11:00 PM - 12:30 AM');
  });

  // ─── Edge cases ───

  it('noon (12:00 PM) to PM', () => {
    expect(formatTimeCompact('12:00', '13:00')).toBe('12:00 - 1:00 PM');
  });

  it('midnight (00:00 AM) to AM', () => {
    expect(formatTimeCompact('00:00', '01:00')).toBe('12:00 - 1:00 AM');
  });

  it('noon to noon-ish stays PM', () => {
    expect(formatTimeCompact('12:00', '12:30')).toBe('12:00 - 12:30 PM');
  });

  it('handles single-digit minutes', () => {
    expect(formatTimeCompact('09:05', '10:05')).toBe('9:05 - 10:05 AM');
  });

  it('handles exact hour times', () => {
    expect(formatTimeCompact('10:00', '11:00')).toBe('10:00 - 11:00 AM');
  });

  it('AM to exactly noon shows both periods', () => {
    expect(formatTimeCompact('11:00', '12:00')).toBe('11:00 AM - 12:00 PM');
  });

  it('midnight to early morning stays AM', () => {
    expect(formatTimeCompact('00:00', '06:00')).toBe('12:00 - 6:00 AM');
  });

  it('same time returns correctly', () => {
    expect(formatTimeCompact('10:00', '10:00')).toBe('10:00 - 10:00 AM');
  });
});
