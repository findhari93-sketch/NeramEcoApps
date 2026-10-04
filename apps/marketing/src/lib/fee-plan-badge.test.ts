import { describe, it, expect } from 'vitest';
import { durationInMonths, getFeePlanBadge } from './fee-plan-badge';

/**
 * Regression: on prod both public plans are `year_long` ("12 months" and
 * "24 Months"), so the old check gave both cards the future-year badge and
 * neither card was highlighted.
 */
describe('durationInMonths', () => {
  it.each([
    ['12 months', 12],
    ['24 Months', 24],
    ['3 Months', 3],
    ['1 month', 1],
    ['1 year', 12],
    ['2 years', 24],
    ['One year', 12],
    ['Two years', 24],
  ])('reads %s as %d months', (text, months) => {
    expect(durationInMonths(text)).toBe(months);
  });

  it('returns null for empty or unclear text', () => {
    expect(durationInMonths(null)).toBeNull();
    expect(durationInMonths('')).toBeNull();
    expect(durationInMonths('Flexible')).toBeNull();
  });
});

describe('getFeePlanBadge', () => {
  it('marks a 12 month year_long plan for the current year exam', () => {
    expect(getFeePlanBadge({ duration: '12 months', program_type: 'year_long' })).toBe('current_year');
  });

  it('marks a 24 month year_long plan for a future year exam', () => {
    expect(getFeePlanBadge({ duration: '24 Months', program_type: 'year_long' })).toBe('future_year');
  });

  it('falls back to the crash course type when the duration is missing', () => {
    expect(getFeePlanBadge({ duration: null as unknown as string, program_type: 'crash_course' })).toBe('current_year');
  });

  it('gives no badge when nothing is known', () => {
    expect(getFeePlanBadge({ duration: 'Flexible', program_type: 'year_long' })).toBeNull();
  });
});
