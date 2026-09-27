// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildOutcomesItemListJsonLd, buildReviewJsonLd, buildReviewsPageJsonLd, type PublicReview } from './json-ld';
import { aggregateRatingFromSummary } from './rules';

const review = (over: Partial<PublicReview> = {}): PublicReview => ({
  id: 'r1',
  displayName: 'Meera S.',
  body: 'The drawing feedback helped me most.',
  rating: 4,
  examType: 'NATA',
  year: 2025,
  city: 'Salem',
  collegeAdmitted: null,
  courseName: 'NATA Mastery',
  photo: null,
  isFeatured: false,
  createdAt: '2026-03-04T10:00:00Z',
  ...over,
});

describe('buildReviewJsonLd', () => {
  it('emits a Review with author, body, date and the rating as given', () => {
    expect(buildReviewJsonLd(review({ rating: 2 }), 'en')).toEqual({
      '@type': 'Review',
      author: { '@type': 'Person', name: 'Meera S.' },
      reviewBody: 'The drawing feedback helped me most.',
      inLanguage: 'en',
      datePublished: '2026-03-04',
      reviewRating: { '@type': 'Rating', ratingValue: '2', bestRating: '5', worstRating: '1' },
    });
  });

  it('omits the rating and date when they are missing or invalid', () => {
    const node = buildReviewJsonLd(review({ rating: null, createdAt: 'not a date' }), 'ta');
    expect(node).not.toHaveProperty('reviewRating');
    expect(node).not.toHaveProperty('datePublished');
    expect(buildReviewJsonLd(review({ rating: 7 }), 'en')).not.toHaveProperty('reviewRating');
  });
});

describe('buildReviewsPageJsonLd', () => {
  const enough = aggregateRatingFromSummary({ reviewCount: 9, ratingCount: 9, average: 4.6 });

  it('includes AggregateRating only when one is supplied', () => {
    const withRating = buildReviewsPageJsonLd({ reviews: [review()], aggregateRating: enough, inLanguage: 'en' });
    expect(withRating?.aggregateRating).toEqual(enough);
    expect(withRating?.review).toHaveLength(1);

    const withoutRating = buildReviewsPageJsonLd({ reviews: [review()], aggregateRating: null, inLanguage: 'en' });
    expect(withoutRating).not.toHaveProperty('aggregateRating');
    expect(withoutRating?.review).toHaveLength(1);
  });

  it('emits nothing when there are no reviews and no rating', () => {
    expect(buildReviewsPageJsonLd({ reviews: [], aggregateRating: null, inLanguage: 'en' })).toBeNull();
  });

  it('skips reviews without a body or a name', () => {
    const node = buildReviewsPageJsonLd({
      reviews: [review(), review({ id: 'r2', body: '' }), review({ id: 'r3', displayName: '' })],
      aggregateRating: null,
      inLanguage: 'en',
    });
    expect(node?.review).toHaveLength(1);
  });

  it('never carries a hardcoded rating', () => {
    const json = JSON.stringify(buildReviewsPageJsonLd({ reviews: [review({ rating: 3 })], aggregateRating: null, inLanguage: 'en' }));
    expect(json).not.toContain('AggregateRating');
    expect(json).not.toMatch(/"ratingValue":"4\.[89]"/);
  });
});

describe('buildOutcomesItemListJsonLd', () => {
  it('lists only outcomes with their own result page', () => {
    const base = { exam: 'NATA', examYear: 2025, college: null, score: 150, maxScore: 200, rank: null };
    const node = buildOutcomesItemListJsonLd(
      [
        { ...base, id: 'result:1', displayName: 'A', slug: 'a-nata-2025' },
        { ...base, id: 'result:2', displayName: 'B', slug: null },
      ],
      (slug) => `https://neramclasses.com/achievements/${slug}`,
    );
    expect(node?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, url: 'https://neramclasses.com/achievements/a-nata-2025', name: 'A' },
    ]);
    expect(buildOutcomesItemListJsonLd([], () => '')).toBeNull();
  });
});
