import { describe, expect, test } from 'vitest';
import {
  SWITCHOVER_MIN_VERIFIED,
  applyReviewFilters,
  combinedGoogleRating,
  facetOptions,
  factsSentence,
  filtersToQuery,
  hasActiveFilters,
  parseReviewFilters,
  quotableGoogleRatings,
  resultLabel,
  sameAsUrls,
  shouldSwitchOver,
  topColleges,
} from './hub';
import { buildReviewsPageJsonLd, type PublicReview } from './json-ld';

const review = (over: Partial<PublicReview>): PublicReview => ({
  id: Math.random().toString(36).slice(2),
  displayName: 'Priya S.',
  body: 'Good classes.',
  rating: 5,
  examType: 'NATA',
  year: 2026,
  city: 'Chennai',
  collegeAdmitted: 'SPA Delhi',
  courseName: null,
  photo: null,
  isFeatured: false,
  createdAt: '2026-10-01',
  rank: null,
  percentile: null,
  learningMode: 'offline',
  isVerified: true,
  ...over,
});

describe('switch-over', () => {
  test('waits for enough verified reviews', () => {
    expect(shouldSwitchOver(SWITCHOVER_MIN_VERIFIED - 1)).toBe(false);
    expect(shouldSwitchOver(SWITCHOVER_MIN_VERIFIED)).toBe(true);
    expect(shouldSwitchOver(Number.NaN)).toBe(false);
  });
});

describe('filters', () => {
  const reviews = [
    review({ year: 2026, city: 'Chennai', learningMode: 'online', collegeAdmitted: 'SPA Delhi' }),
    review({ year: 2025, city: 'chennai ', learningMode: 'offline', collegeAdmitted: 'NIT Trichy' }),
    review({ year: 2026, city: 'Madurai', learningMode: 'hybrid', collegeAdmitted: null }),
  ];

  test('parse drops anything odd', () => {
    const f = parseReviewFilters((k) => ({ year: '2026', city: ' Chennai ', mode: 'teleport', college: '' } as Record<string, string>)[k]);
    expect(f).toEqual({ year: 2026, city: 'Chennai', mode: null, college: null });
    expect(parseReviewFilters(() => '1999').year).toBeNull();
  });

  test('match city case-insensitively and combine', () => {
    expect(applyReviewFilters(reviews, { year: null, city: 'CHENNAI', mode: null, college: null })).toHaveLength(2);
    expect(applyReviewFilters(reviews, { year: 2026, city: 'Chennai', mode: 'online', college: null })).toHaveLength(1);
    expect(applyReviewFilters(reviews, { year: null, city: null, mode: null, college: 'nit trichy' })).toHaveLength(1);
  });

  test('facets list only values some review has, deduplicated', () => {
    expect(facetOptions(reviews)).toEqual({
      years: [2026, 2025],
      cities: ['Chennai', 'Madurai'],
      modes: ['online', 'hybrid', 'offline'],
      colleges: ['NIT Trichy', 'SPA Delhi'],
    });
  });

  test('query string round trip', () => {
    const f = { year: 2026, city: 'Chennai', mode: 'online' as const, college: null };
    expect(filtersToQuery(f)).toBe('year=2026&city=Chennai&mode=online');
    expect(hasActiveFilters(f)).toBe(true);
    expect(hasActiveFilters({ year: null, city: null, mode: null, college: null })).toBe(false);
  });
});

describe('Google ratings', () => {
  const rows = [
    { name: 'Coimbatore', city: 'Coimbatore', rating: '5.0', review_count: 100, google_reviews_url: 'https://g.page/r/cbe' },
    { name: 'Pudukkottai', city: 'Pudukkottai', rating: '5.0', review_count: 0 },
    { name: 'Madurai', city: 'Madurai', rating: 4.6, review_count: 20 },
    { name: 'Bad', city: 'X', rating: 7, review_count: 9 },
  ];

  test('a rating with no reviews, or out of range, is not quotable', () => {
    expect(quotableGoogleRatings(rows).map((r) => r.city)).toEqual(['Coimbatore', 'Madurai']);
  });

  test('combined rating is weighted by review count', () => {
    expect(combinedGoogleRating(quotableGoogleRatings(rows))).toEqual({ rating: 4.9, count: 120, profiles: 2 });
    expect(combinedGoogleRating([])).toBeNull();
  });
});

describe('facts sentence', () => {
  test('says only what the data supports, one fact per sentence, with no dashes', () => {
    const s = factsSentence({ publishedCount: 12, verifiedCount: 9, google: { rating: 4.9, count: 120, profiles: 2 }, colleges: ['SPA Delhi', 'NIT Trichy'] });
    expect(s).toBe(
      'Neram Classes has 12 published student reviews, 9 of them from verified Neram students. Its Google rating is 4.9 from 120 reviews across 2 centres. Students now study at SPA Delhi and NIT Trichy.',
    );
    expect(s).not.toMatch(/—|--/);
  });

  test('leaves empty facts out, and says nothing when there is nothing', () => {
    expect(factsSentence({ publishedCount: 0, verifiedCount: 0, google: null, colleges: [] })).toBeNull();
    expect(factsSentence({ publishedCount: 1, verifiedCount: 0, google: null, colleges: [] })).toBe('Neram Classes has 1 published student review.');
    expect(factsSentence({ publishedCount: 3, verifiedCount: 3, google: null, colleges: [] })).toBe('Neram Classes has 3 published student reviews, all from verified Neram students.');
  });

  test('top colleges counts mentions', () => {
    expect(topColleges([review({ collegeAdmitted: 'NIT Trichy' }), review({ collegeAdmitted: 'SPA Delhi' }), review({ collegeAdmitted: 'nit trichy' })])).toEqual(['NIT Trichy', 'SPA Delhi']);
  });
});

describe('cards and schema', () => {
  test('result label prefers the rank', () => {
    expect(resultLabel({ rank: 142, percentile: 99 })).toBe('AIR 142');
    expect(resultLabel({ rank: null, percentile: 98.5 })).toBe('98.5 percentile');
    expect(resultLabel({ rank: null, percentile: null })).toBeNull();
  });

  test('sameAs keeps https links once', () => {
    expect(sameAsUrls(['https://g.page/a', 'https://g.page/a', 'http://x.com', null, ' '])).toEqual(['https://g.page/a']);
  });

  test('the hub JSON-LD has sameAs and no self-computed rating', () => {
    const node = buildReviewsPageJsonLd({ reviews: [review({})], aggregateRating: null, inLanguage: 'en', sameAs: ['https://g.page/a'] }) as Record<string, unknown>;
    expect(node.sameAs).toEqual(['https://g.page/a']);
    expect(node).not.toHaveProperty('aggregateRating');
    expect((node.review as unknown[]).length).toBe(1);
  });
});
