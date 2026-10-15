import type { CollegeTier } from './types';

const PAID: readonly CollegeTier[] = ['silver', 'gold', 'platinum'];

/** Today's date in India as YYYY-MM-DD (plans start and end on IST dates). */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The tier a college actually has today. Admin > College Hub > Plans writes
 * neram_tier and the plan dates, and a daily database job drops ended plans to
 * free. This is the read-side guard for the hours between a plan ending and
 * that job (or a page cached before it): a plan outside its dates, or an
 * unknown tier value, counts as free.
 */
export function effectiveTier(
  college: { neram_tier?: string | null; tier_start_date?: string | null; tier_end_date?: string | null },
  today: string = istToday()
): CollegeTier {
  const tier = college.neram_tier as CollegeTier | null | undefined;
  if (!tier || !PAID.includes(tier)) return 'free';
  if (college.tier_start_date && college.tier_start_date > today) return 'free';
  if (college.tier_end_date && college.tier_end_date < today) return 'free';
  return tier;
}

export const TIER_LABEL: Record<CollegeTier, string> = {
  free: 'Free listing',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};
