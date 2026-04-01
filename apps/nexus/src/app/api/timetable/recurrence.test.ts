import { describe, it, expect } from 'vitest';
import { generateRecurrenceDates } from './recurrence';

describe('generateRecurrenceDates', () => {
  // ─── DAILY RECURRENCE ───

  it('generates weekdays only for daily rule (skips Sunday)', () => {
    // 2026-06-15 is a Monday, 2026-06-21 is a Sunday
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-21', 'daily');
    expect(dates).toEqual([
      '2026-06-15', // Mon
      '2026-06-16', // Tue
      '2026-06-17', // Wed
      '2026-06-18', // Thu
      '2026-06-19', // Fri
      '2026-06-20', // Sat
      // Sunday skipped
    ]);
  });

  it('handles single day for daily rule', () => {
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-15', 'daily');
    // 2026-06-15 is Monday
    expect(dates).toEqual(['2026-06-15']);
  });

  it('returns empty for daily rule starting on Sunday with same end date', () => {
    // 2026-06-21 is a Sunday
    const dates = generateRecurrenceDates('2026-06-21', '2026-06-21', 'daily');
    expect(dates).toEqual([]);
  });

  it('generates two weeks of daily classes correctly', () => {
    // 2026-06-15 (Mon) to 2026-06-28 (Sun) = 14 days, 12 weekdays
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-28', 'daily');
    expect(dates).toHaveLength(12); // 6 per week * 2 weeks
    // No Sundays
    for (const d of dates) {
      const day = new Date(d + 'T00:00:00').getDay();
      expect(day).not.toBe(0);
    }
  });

  // ─── WEEKLY RECURRENCE ───

  it('generates Mon/Wed/Fri classes for weekly rule', () => {
    // 2026-06-15 (Mon) to 2026-06-21 (Sun)
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-21', 'weekly:mon,wed,fri');
    expect(dates).toEqual([
      '2026-06-15', // Mon
      '2026-06-17', // Wed
      '2026-06-19', // Fri
    ]);
  });

  it('handles weekly:sat correctly', () => {
    // 2026-06-15 (Mon) to 2026-06-21 (Sun)
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-21', 'weekly:sat');
    expect(dates).toEqual(['2026-06-20']); // Only Saturday
  });

  it('generates Tue/Thu for multiple weeks', () => {
    // 2026-06-15 (Mon) to 2026-06-28 (Sun) = 2 weeks
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-28', 'weekly:tue,thu');
    expect(dates).toEqual([
      '2026-06-16', // Tue
      '2026-06-18', // Thu
      '2026-06-23', // Tue
      '2026-06-25', // Thu
    ]);
  });

  it('returns empty when no matching days in range', () => {
    // 2026-06-15 (Mon) to 2026-06-16 (Tue) with only fri
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-16', 'weekly:fri');
    expect(dates).toEqual([]);
  });

  it('handles case-insensitive day names', () => {
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-21', 'weekly:Mon,WED,Fri');
    expect(dates).toHaveLength(3);
  });

  // ─── EDGE CASES ───

  it('returns start date for unknown rule', () => {
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-30', 'unknown_rule');
    expect(dates).toEqual(['2026-06-15']);
  });

  it('returns empty for end date before start date (daily)', () => {
    const dates = generateRecurrenceDates('2026-06-30', '2026-06-15', 'daily');
    expect(dates).toEqual([]);
  });

  it('returns empty for end date before start date (weekly)', () => {
    const dates = generateRecurrenceDates('2026-06-30', '2026-06-15', 'weekly:mon');
    expect(dates).toEqual([]);
  });

  it('handles same start and end date with matching weekly day', () => {
    // 2026-06-15 is Monday
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-15', 'weekly:mon');
    expect(dates).toEqual(['2026-06-15']);
  });

  it('handles same start and end date with non-matching weekly day', () => {
    // 2026-06-15 is Monday
    const dates = generateRecurrenceDates('2026-06-15', '2026-06-15', 'weekly:tue');
    expect(dates).toEqual([]);
  });
});
