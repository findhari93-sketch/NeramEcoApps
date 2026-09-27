/**
 * JSON-LD for the public review pages. Pure: unit tested in json-ld.test.ts.
 *
 * Each rendered review becomes a schema.org Review nested in the organization
 * node. AggregateRating is attached only when the caller passes one built from
 * published data (see rules.ts aggregateRatingFromSummary); otherwise it is
 * omitted entirely.
 */

import { BASE_URL, ORG_NAME } from '@/lib/seo/constants';
import type { AggregateRatingJsonLd } from '@/lib/seo/schemas';

export interface PublicReview {
  id: string;
  displayName: string;
  body: string;
  rating: number | null;
  examType: string | null;
  year: number | null;
  city: string | null;
  collegeAdmitted: string | null;
  courseName: string | null;
  photo: string | null;
  isFeatured: boolean;
  createdAt: string | null;
}

/** ISO date (YYYY-MM-DD) or undefined when the value is not a date. */
function isoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

export function buildReviewJsonLd(review: PublicReview, inLanguage: string) {
  const node: Record<string, unknown> = {
    '@type': 'Review',
    author: { '@type': 'Person', name: review.displayName },
    reviewBody: review.body,
    inLanguage,
  };
  const date = isoDate(review.createdAt);
  if (date) node.datePublished = date;
  if (review.rating != null && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5) {
    node.reviewRating = {
      '@type': 'Rating',
      ratingValue: String(review.rating),
      bestRating: '5',
      worstRating: '1',
    };
  }
  return node;
}

/**
 * The organization node for a reviews page: the reviews on this page, plus the
 * AggregateRating only when one is supplied. Returns null when there is nothing
 * to say (no reviews and no rating), so the page emits no empty node.
 */
export function buildReviewsPageJsonLd(opts: {
  reviews: PublicReview[];
  aggregateRating: AggregateRatingJsonLd | null;
  inLanguage: string;
}) {
  const reviews = opts.reviews.filter((r) => r.body && r.displayName);
  if (reviews.length === 0 && !opts.aggregateRating) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    url: BASE_URL,
    ...(opts.aggregateRating ? { aggregateRating: opts.aggregateRating } : {}),
    ...(reviews.length > 0 ? { review: reviews.map((r) => buildReviewJsonLd(r, opts.inLanguage)) } : {}),
  };
}

export interface PublicOutcome {
  id: string;
  displayName: string;
  exam: string | null;
  examYear: number | null;
  college: string | null;
  score: number | null;
  maxScore: number | null;
  rank: number | null;
  slug: string | null;
}

/** An ItemList of the outcomes that have their own public result page. */
export function buildOutcomesItemListJsonLd(outcomes: PublicOutcome[], urlFor: (slug: string) => string) {
  const linked = outcomes.filter((o) => o.slug);
  if (linked.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: linked.map((o, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: urlFor(o.slug as string),
      name: o.displayName,
    })),
  };
}
