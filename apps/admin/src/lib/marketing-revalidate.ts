/**
 * Purges marketing ISR content after staff edit it here.
 *
 * Marketing renders reviews, testimonials and #AskSeniors as ISR pages
 * revalidated once a day. This POSTs the matching cache tags to marketing's
 * /api/revalidate so a save shows up right away. It never throws and gives up
 * after a short timeout: a slow or unreachable marketing site must never fail
 * or stall an admin save (the content still refreshes within a day).
 *
 * Needs REVALIDATE_SECRET (the same value in the admin and marketing Vercel
 * projects). Without it this is a no-op.
 *
 * Keep the tag strings in sync with apps/marketing/src/lib/cache-tags.ts.
 */
import { marketingOriginFor } from './marketing-links';

export const MARKETING_CACHE_TAGS = {
  reviews: 'reviews',
  reviewStats: 'public-review-stats',
  learnerOutcomes: 'learner-outcomes',
  askSeniors: 'ask-seniors',
} as const;

export type MarketingCacheTag = (typeof MARKETING_CACHE_TAGS)[keyof typeof MARKETING_CACHE_TAGS];

/** Tags to purge after any testimonial change (they feed /reviews, /testimonials, /alumni and the rating). */
export const TESTIMONIAL_TAGS: MarketingCacheTag[] = [MARKETING_CACHE_TAGS.reviews, MARKETING_CACHE_TAGS.reviewStats];

const DEFAULT_TIMEOUT_MS = 2500;

export async function revalidateMarketing(
  tags: MarketingCacheTag[] | string[],
  options: { adminOrigin?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || tags.length === 0) return false;

  const origin = marketingOriginFor(options.adminOrigin, process.env.NEXT_PUBLIC_MARKETING_URL);
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await doFetch(`${origin}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) console.warn(`[marketing-revalidate] ${res.status} for tags ${tags.join(',')}`);
    return res.ok;
  } catch (error) {
    console.warn('[marketing-revalidate] failed:', (error as Error)?.message ?? error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
