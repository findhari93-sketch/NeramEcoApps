/**
 * Site Header width tiers, measured on the header container (a CSS container
 * query), never the viewport:
 * - full (1240 and up): everything shown in full
 * - compact (1060 to 1239): secondary button icon-only, primary drops " application"
 * - tight (900 to 1059): nav = Colleges + Exam Hub + a More menu
 * - mobile (below 900): wordmark, search, short primary, menu
 */

export const HEADER_CONTAINER = 'siteheader';

export const HEADER_TIER_MIN = { tight: 900, compact: 1060, full: 1240 } as const;

export type HeaderTier = 'mobile' | 'tight' | 'compact' | 'full';

export function headerTier(width: number): HeaderTier {
  if (width >= HEADER_TIER_MIN.full) return 'full';
  if (width >= HEADER_TIER_MIN.compact) return 'compact';
  if (width >= HEADER_TIER_MIN.tight) return 'tight';
  return 'mobile';
}

/** sx key for "this tier and wider", e.g. `{ display: 'none', [fromTier('tight')]: { display: 'flex' } }`. */
export function fromTier(tier: Exclude<HeaderTier, 'mobile'>): string {
  return `@container ${HEADER_CONTAINER} (min-width: ${HEADER_TIER_MIN[tier]}px)`;
}
