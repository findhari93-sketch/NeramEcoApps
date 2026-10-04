import type { FeeStructure } from '@neram/database';

export type FeePlanBadge = 'current_year' | 'future_year';

/**
 * Reads a plan length in months from the free-text duration staff type in
 * Admin > Fee Structures ("12 months", "24 Months", "1 year", "2 years").
 * Returns null when the text has no number we can trust.
 */
export function durationInMonths(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const text = duration.toLowerCase();
  const months = text.match(/(\d+)\s*months?/);
  if (months) return Number(months[1]);
  const years = text.match(/(\d+)\s*(?:years?|yrs?)/);
  if (years) return Number(years[1]) * 12;
  if (/\bone\s+year\b/.test(text)) return 12;
  if (/\btwo\s+years?\b/.test(text)) return 24;
  return null;
}

/**
 * Plans up to a year suit this year's exam; longer plans suit a later exam.
 * The duration decides first, because both public plans are `year_long`.
 */
export function getFeePlanBadge(
  fee: Pick<FeeStructure, 'duration' | 'program_type'>,
): FeePlanBadge | null {
  const months = durationInMonths(fee.duration);
  if (months !== null) return months <= 12 ? 'current_year' : 'future_year';
  if (fee.program_type === 'crash_course') return 'current_year';
  return null;
}
