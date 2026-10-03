/**
 * The one place the marketing site reads its public rating.
 *
 * The rating comes from public_review_stats() over published testimonials, cached
 * for a day and purged on admin review saves (tags in lib/cache-tags.ts). It is returned only when at least MIN_RATINGS_FOR_AGGREGATE
 * published reviews carry a rating; otherwise callers get null and must omit
 * AggregateRating. Never hardcode a rating anywhere else on the site.
 */

import { unstable_cache } from 'next/cache';
import { createAdminClientISR, getPublicReviewStats } from '@neram/database';
import type { AggregateRatingJsonLd } from '@/lib/seo/schemas';
import { CACHE_TAGS } from '@/lib/cache-tags';
import {
  aggregateRatingFromSummary,
  summarizeStats,
  type ReviewExam,
  type ReviewStatsRow,
  type ReviewSummary,
} from '@/lib/reviews/rules';

export const REVIEW_STATS_REVALIDATE = 86400;

const readStats = unstable_cache(
  async (): Promise<ReviewStatsRow[]> => {
    try {
      const rows = await getPublicReviewStats(createAdminClientISR(REVIEW_STATS_REVALIDATE));
      return (rows || []).map((r) => ({
        scope: String(r.scope),
        review_count: Number(r.review_count) || 0,
        rating_count: Number(r.rating_count) || 0,
        average_rating: r.average_rating == null ? null : Number(r.average_rating),
      }));
    } catch {
      // Missing env at build time or the function is not deployed yet: no rating.
      return [];
    }
  },
  ['marketing-public-review-stats-v1'],
  { revalidate: REVIEW_STATS_REVALIDATE, tags: [CACHE_TAGS.reviewStats, CACHE_TAGS.reviews] },
);

/** Review and rating counts for a page scope, or null when unavailable. */
export async function getReviewSummary(exam: ReviewExam = 'all'): Promise<ReviewSummary | null> {
  return summarizeStats(await readStats(), exam);
}

/** The data-driven AggregateRating, or null (omit the property when null). */
export async function getAggregateRating(exam: ReviewExam = 'all'): Promise<AggregateRatingJsonLd | null> {
  return aggregateRatingFromSummary(await getReviewSummary(exam));
}
