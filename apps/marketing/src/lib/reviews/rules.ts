/**
 * Pure rules for the public review pages (/reviews, /reviews/nata, /reviews/jee,
 * /learner-stories). No Supabase, no Next.js: unit tested in rules.test.ts.
 *
 * The honesty rules live here:
 *   - A rating is shown (and emitted as AggregateRating) only when it comes from
 *     published data and at least MIN_RATINGS_FOR_AGGREGATE reviews carry one.
 *   - A page with too little published content is noindexed until it has enough.
 */

import type { AggregateRatingJsonLd } from '@/lib/seo/schemas';

export const MIN_RATINGS_FOR_AGGREGATE = 5;
/** Below this many published items a stories page is thin: render it, but noindex it. */
export const MIN_ITEMS_FOR_INDEX = 5;
export const REVIEWS_PAGE_SIZE = 12;

export type ReviewExam = 'all' | 'nata' | 'jee';
export const REVIEW_EXAMS: ReviewExam[] = ['all', 'nata', 'jee'];

/** One row of public_review_stats(): scopes 'all', 'nata', 'jee_paper_2', 'both'. */
export interface ReviewStatsRow {
  scope: string;
  review_count: number;
  rating_count: number;
  average_rating: number | null;
}

export interface ReviewSummary {
  reviewCount: number;
  ratingCount: number;
  /** Rounded to one decimal; null when nothing carries a rating. */
  average: number | null;
}

/**
 * The stats for a page. The NATA page lists NATA and "both" reviews, and the JEE
 * page lists JEE Paper 2 and "both" reviews, so their summaries combine those two
 * scopes, weighted by how many ratings each has.
 */
export function summarizeStats(rows: ReviewStatsRow[], exam: ReviewExam): ReviewSummary | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const byScope = new Map(rows.map((r) => [String(r.scope).toLowerCase(), r]));
  const scopes = exam === 'all' ? ['all'] : exam === 'nata' ? ['nata', 'both'] : ['jee_paper_2', 'both'];
  const picked = scopes.map((s) => byScope.get(s)).filter(Boolean) as ReviewStatsRow[];
  if (exam === 'all' && picked.length === 0) return null;

  let reviewCount = 0;
  let ratingCount = 0;
  let weighted = 0;
  for (const r of picked) {
    const reviews = Number(r.review_count) || 0;
    const ratings = Number(r.rating_count) || 0;
    reviewCount += reviews;
    if (ratings > 0 && r.average_rating != null && Number.isFinite(Number(r.average_rating))) {
      ratingCount += ratings;
      weighted += Number(r.average_rating) * ratings;
    }
  }
  return {
    reviewCount,
    ratingCount,
    average: ratingCount > 0 ? Math.round((weighted / ratingCount) * 10) / 10 : null,
  };
}

/** True when the rating is backed by enough published ratings to state it. */
export function hasEnoughRatings(summary: ReviewSummary | null | undefined): summary is ReviewSummary & { average: number } {
  return !!summary && summary.average != null && summary.ratingCount >= MIN_RATINGS_FOR_AGGREGATE;
}

/** The AggregateRating node, or null when the data does not support one. */
export function aggregateRatingFromSummary(summary: ReviewSummary | null | undefined): AggregateRatingJsonLd | null {
  if (!hasEnoughRatings(summary)) return null;
  return {
    '@type': 'AggregateRating',
    ratingValue: summary.average.toFixed(1),
    ratingCount: String(summary.ratingCount),
    reviewCount: String(summary.reviewCount),
    bestRating: '5',
    worstRating: '1',
  };
}

/** A review page is indexable only when its rating is honest (enough ratings). */
export function shouldIndexReviewsPage(summary: ReviewSummary | null | undefined): boolean {
  return hasEnoughRatings(summary);
}

/** Counts of 5, 4, 3, 2 and 1 star ratings, highest first. Lower ratings stay visible. */
export function ratingDistribution(ratings: Array<number | null | undefined>): Array<{ stars: number; count: number }> {
  const counts = [0, 0, 0, 0, 0];
  for (const r of ratings) {
    const n = Number(r);
    if (Number.isInteger(n) && n >= 1 && n <= 5) counts[n - 1] += 1;
  }
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts[stars - 1] }));
}

/**
 * Review text in the reader's language, falling back to English, then to any
 * language present. Content is jsonb ({ en, ta, ... }); older rows may be a string.
 */
export function localizedContent(content: unknown, locale: string): string {
  if (typeof content === 'string') return content.trim();
  if (!content || typeof content !== 'object') return '';
  const map = content as Record<string, unknown>;
  const pick = (k: string) => (typeof map[k] === 'string' ? (map[k] as string).trim() : '');
  const own = pick(locale);
  if (own) return own;
  const en = pick('en');
  if (en) return en;
  for (const k of Object.keys(map)) {
    const v = pick(k);
    if (v) return v;
  }
  return '';
}

/** 1-based page number from a route segment; null for anything that is not a page >= 2. */
export function parsePageSegment(segment: string | undefined): number | null {
  if (!segment || !/^\d{1,4}$/.test(segment)) return null;
  const n = Number(segment);
  return n >= 2 ? n : null;
}

export function totalPages(total: number, pageSize = REVIEWS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** Path without locale prefix: /reviews, /reviews/nata, /reviews/page/2, /reviews/jee/page/3. */
export function reviewsPath(exam: ReviewExam, page = 1): string {
  const base = exam === 'all' ? '/reviews' : `/reviews/${exam}`;
  return page > 1 ? `${base}/page/${page}` : base;
}

/** Locale-prefixed path (English has no prefix, localePrefix 'as-needed'). */
export function localePath(locale: string, path: string): string {
  return locale === 'en' ? path || '/' : `/${locale}${path}`;
}

export function examLabel(examType: string | null | undefined): string {
  switch ((examType || '').toUpperCase()) {
    case 'NATA':
      return 'NATA';
    case 'JEE_PAPER_2':
    case 'JEE_PAPER2':
      return 'JEE Paper 2';
    case 'BOTH':
      return 'NATA and JEE Paper 2';
    case 'TNEA':
      return 'TNEA';
    default:
      return '';
  }
}

/** Initials for an avatar when there is no photo. */
export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Hosts next.config.js allows for next/image. Anything else gets initials instead. */
const IMAGE_HOSTS = [
  'db.neramclasses.com',
  'db-staging.neramclasses.com',
  'zdnypksjqnhtiblwdaic.supabase.co',
  'hgxjavrsrvpihqrpezdh.supabase.co',
];

export function isOptimizableImage(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && IMAGE_HOSTS.includes(u.hostname) && u.pathname.startsWith('/storage/v1/object/public/');
  } catch {
    return false;
  }
}
