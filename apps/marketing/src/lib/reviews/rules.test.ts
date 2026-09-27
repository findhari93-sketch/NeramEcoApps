// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  MIN_RATINGS_FOR_AGGREGATE,
  aggregateRatingFromSummary,
  hasEnoughRatings,
  initials,
  isOptimizableImage,
  localePath,
  localizedContent,
  parsePageSegment,
  ratingDistribution,
  reviewsPath,
  shouldIndexReviewsPage,
  summarizeStats,
  totalPages,
  type ReviewStatsRow,
} from './rules';

// Shape of public_review_stats() on staging, 2026-09-26.
const STATS: ReviewStatsRow[] = [
  { scope: 'all', review_count: 9, rating_count: 9, average_rating: 4.56 },
  { scope: 'both', review_count: 2, rating_count: 2, average_rating: 4 },
  { scope: 'jee_paper_2', review_count: 2, rating_count: 2, average_rating: 5 },
  { scope: 'nata', review_count: 5, rating_count: 5, average_rating: 4.6 },
];

describe('summarizeStats', () => {
  it('uses the all scope for /reviews', () => {
    expect(summarizeStats(STATS, 'all')).toEqual({ reviewCount: 9, ratingCount: 9, average: 4.6 });
  });

  it('combines NATA with "both" reviews, weighted by rating count', () => {
    // (4.6 * 5 + 4 * 2) / 7 = 4.43
    expect(summarizeStats(STATS, 'nata')).toEqual({ reviewCount: 7, ratingCount: 7, average: 4.4 });
  });

  it('combines JEE Paper 2 with "both" reviews', () => {
    // (5 * 2 + 4 * 2) / 4 = 4.5
    expect(summarizeStats(STATS, 'jee')).toEqual({ reviewCount: 4, ratingCount: 4, average: 4.5 });
  });

  it('returns null when the stats are unavailable', () => {
    expect(summarizeStats([], 'all')).toBeNull();
    expect(summarizeStats([{ scope: 'nata', review_count: 1, rating_count: 1, average_rating: 5 }], 'all')).toBeNull();
  });

  it('has no average when nothing carries a rating', () => {
    expect(summarizeStats([{ scope: 'all', review_count: 3, rating_count: 0, average_rating: null }], 'all')).toEqual({
      reviewCount: 3,
      ratingCount: 0,
      average: null,
    });
  });
});

describe('rating threshold', () => {
  it(`needs at least ${MIN_RATINGS_FOR_AGGREGATE} ratings`, () => {
    expect(hasEnoughRatings({ reviewCount: 4, ratingCount: 4, average: 5 })).toBe(false);
    expect(hasEnoughRatings({ reviewCount: 6, ratingCount: 5, average: 3.2 })).toBe(true);
    expect(hasEnoughRatings({ reviewCount: 9, ratingCount: 0, average: null })).toBe(false);
    expect(hasEnoughRatings(null)).toBe(false);
  });

  it('builds AggregateRating only from enough data, never otherwise', () => {
    expect(aggregateRatingFromSummary(summarizeStats(STATS, 'jee'))).toBeNull();
    expect(aggregateRatingFromSummary(null)).toBeNull();
    expect(aggregateRatingFromSummary(summarizeStats(STATS, 'nata'))).toEqual({
      '@type': 'AggregateRating',
      ratingValue: '4.4',
      ratingCount: '7',
      reviewCount: '7',
      bestRating: '5',
      worstRating: '1',
    });
  });

  it('keeps a low average as it is', () => {
    const low = aggregateRatingFromSummary({ reviewCount: 5, ratingCount: 5, average: 2.4 });
    expect(low?.ratingValue).toBe('2.4');
  });

  it('noindexes a page until its rating is honest', () => {
    expect(shouldIndexReviewsPage(summarizeStats(STATS, 'all'))).toBe(true);
    expect(shouldIndexReviewsPage(summarizeStats(STATS, 'jee'))).toBe(false);
    expect(shouldIndexReviewsPage(null)).toBe(false);
  });
});

describe('ratingDistribution', () => {
  it('counts every star level, lower ratings included, and ignores junk', () => {
    expect(ratingDistribution([5, 5, 4, 1, 2, null, 0, 6, 3.5, undefined])).toEqual([
      { stars: 5, count: 2 },
      { stars: 4, count: 1 },
      { stars: 3, count: 0 },
      { stars: 2, count: 1 },
      { stars: 1, count: 1 },
    ]);
  });
});

describe('localizedContent', () => {
  it('prefers the reader language, then English, then any language', () => {
    expect(localizedContent({ en: 'Hello', ta: 'வணக்கம்' }, 'ta')).toBe('வணக்கம்');
    expect(localizedContent({ en: 'Hello', ta: 'வணக்கம்' }, 'hi')).toBe('Hello');
    expect(localizedContent({ ta: 'வணக்கம்' }, 'kn')).toBe('வணக்கம்');
    expect(localizedContent({ en: '  ', ta: '' }, 'ta')).toBe('');
  });

  it('accepts a plain string and rejects other shapes', () => {
    expect(localizedContent(' Plain ', 'en')).toBe('Plain');
    expect(localizedContent(null, 'en')).toBe('');
    expect(localizedContent(42, 'en')).toBe('');
    expect(localizedContent({ en: 7 }, 'en')).toBe('');
  });
});

describe('paths and pages', () => {
  it('builds review paths without a /page/1', () => {
    expect(reviewsPath('all')).toBe('/reviews');
    expect(reviewsPath('nata', 1)).toBe('/reviews/nata');
    expect(reviewsPath('jee', 3)).toBe('/reviews/jee/page/3');
  });

  it('prefixes non-English locales only', () => {
    expect(localePath('en', '/reviews')).toBe('/reviews');
    expect(localePath('ta', '/reviews')).toBe('/ta/reviews');
    expect(localePath('en', '')).toBe('/');
  });

  it('accepts only page segments of 2 or more', () => {
    expect(parsePageSegment('2')).toBe(2);
    expect(parsePageSegment('1')).toBeNull();
    expect(parsePageSegment('0')).toBeNull();
    expect(parsePageSegment('abc')).toBeNull();
    expect(parsePageSegment('2.5')).toBeNull();
    expect(parsePageSegment('99999')).toBeNull();
    expect(parsePageSegment(undefined)).toBeNull();
  });

  it('counts pages', () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(12)).toBe(1);
    expect(totalPages(13)).toBe(2);
  });
});

describe('display helpers', () => {
  it('makes initials', () => {
    expect(initials('Priya Sharma')).toBe('PS');
    expect(initials('Arjun')).toBe('A');
    expect(initials('  ')).toBe('?');
  });

  it('allows next/image only for our storage hosts', () => {
    expect(isOptimizableImage('https://db.neramclasses.com/storage/v1/object/public/testimonials/a.jpg')).toBe(true);
    expect(isOptimizableImage('https://evil.example.com/storage/v1/object/public/a.jpg')).toBe(false);
    expect(isOptimizableImage('http://db.neramclasses.com/storage/v1/object/public/a.jpg')).toBe(false);
    expect(isOptimizableImage('not a url')).toBe(false);
    expect(isOptimizableImage(null)).toBe(false);
  });
});
