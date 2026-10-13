import { describe, expect, test } from 'vitest';
import {
  buildReplyInstruction,
  matchReviewsToRequests,
  nameSimilarity,
  originalComment,
  readGbpConfig,
  starToNumber,
  stripDashes,
  successPostText,
  toGbpReviewRow,
} from './core';

describe('readGbpConfig', () => {
  test('names exactly what is missing', () => {
    expect(readGbpConfig({ GBP_CLIENT_ID: 'x' })).toEqual({ missing: ['GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_ACCOUNT_ID'] });
  });
  test('accepts the account id with or without the prefix', () => {
    const r = readGbpConfig({ GBP_CLIENT_ID: 'a', GBP_CLIENT_SECRET: 'b', GBP_REFRESH_TOKEN: 'c', GBP_ACCOUNT_ID: 'accounts/123' });
    expect('config' in r && r.config.accountId).toBe('123');
  });
});

describe('reviews', () => {
  test('stars map from Google enums only', () => {
    expect(starToNumber('FIVE')).toBe(5);
    expect(starToNumber('ONE')).toBe(1);
    expect(starToNumber('STAR_RATING_UNSPECIFIED')).toBeNull();
    expect(starToNumber(4)).toBeNull();
  });

  test('keeps the student’s own words, not Google’s translation', () => {
    expect(originalComment('Super classes\n\n(Translated by Google)\nSuper classes')).toBe('Super classes');
    expect(originalComment('(Original)\nநல்ல வகுப்புகள்')).toBe('நல்ல வகுப்புகள்');
    expect(originalComment('  ')).toBeNull();
  });

  test('an anonymous reviewer has no name', () => {
    const row = toGbpReviewRow(
      { name: 'accounts/1/locations/2/reviews/3', reviewer: { displayName: 'A Google user', isAnonymous: true }, starRating: 'FOUR', comment: 'Good' },
      'locations/2',
      'c-1',
      '2026-10-10T00:00:00Z',
    );
    expect(row).toMatchObject({ reviewer_name: null, star_rating: 4, comment: 'Good', center_id: 'c-1', location_name: 'locations/2' });
  });
});

describe('matching', () => {
  test('names compare by words, first name weighs most', () => {
    expect(nameSimilarity('Priya Sharma', 'priya sharma')).toBe(1);
    expect(nameSimilarity('Priya Sharma', 'Priya S')).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity('Priya Sharma', 'Divya Sharma')).toBeLessThan(0.6);
    expect(nameSimilarity('', 'Priya')).toBe(0);
  });

  const requests = [
    { id: 'r1', student_name: 'Priya Sharma', google_clicked_at: '2026-10-01T10:00:00Z', google_review_id: null },
    { id: 'r2', student_name: 'Karthik Rajan', consent_display_name: 'Karthik R.', google_clicked_at: '2026-10-02T10:00:00Z', google_review_id: null },
    { id: 'r3', student_name: 'Divya Lakshmi', google_clicked_at: null, google_review_id: null },
  ];
  const reviews = [
    { google_review_name: 'rev-a', reviewer_name: 'Priya Sharma', create_time: '2026-10-01T10:20:00Z' },
    { google_review_name: 'rev-b', reviewer_name: 'Karthik R', create_time: '2026-10-03T08:00:00Z' },
    { google_review_name: 'rev-c', reviewer_name: 'Divya Lakshmi', create_time: '2026-10-03T08:00:00Z' },
    { google_review_name: 'rev-old', reviewer_name: 'Priya Sharma', create_time: '2026-08-01T10:00:00Z' },
  ];

  test('pairs each student with the review they posted, one to one', () => {
    const m = matchReviewsToRequests(reviews, requests);
    expect(m.map((x) => [x.requestId, x.reviewName])).toEqual([
      ['r1', 'rev-a'],
      ['r2', 'rev-b'],
    ]);
  });

  test('never matches someone who did not open Google, or a review from before', () => {
    const m = matchReviewsToRequests(reviews, requests);
    expect(m.find((x) => x.requestId === 'r3')).toBeUndefined();
    expect(m.find((x) => x.reviewName === 'rev-old')).toBeUndefined();
  });

  test('two equally good reviews for one student are left unmatched', () => {
    const twins = [
      { google_review_name: 't1', reviewer_name: 'Priya Sharma', create_time: '2026-10-01T11:00:00Z' },
      { google_review_name: 't2', reviewer_name: 'Priya Sharma', create_time: '2026-10-01T12:00:00Z' },
    ];
    expect(matchReviewsToRequests(twins, [requests[0]])).toEqual([]);
  });
});

describe('replies and posts', () => {
  test('a low rating asks for an apology and a call, never a change', () => {
    const text = buildReplyInstruction({ stars: 2, centreCity: 'Madurai' });
    expect(text).toMatch(/Apologise sincerely/);
    expect(text).toMatch(/Do not ask them to change the review/);
    expect(text).toMatch(/Madurai/);
    expect(buildReplyInstruction({ stars: 5, centreCity: null })).not.toMatch(/Apologise/);
  });

  test('strips dashes from AI text', () => {
    expect(stripDashes('Thank you — truly -- we loved it')).toBe('Thank you, truly, we loved it');
  });

  test('a success post uses only verified facts and has no dashes', () => {
    const text = successPostText({ firstName: 'Priya', examLabel: 'NATA', year: 2026, rank: 142, percentile: null, college: 'SPA Delhi', centreCity: 'Coimbatore', online: false });
    expect(text).toBe(
      'Congratulations, Priya! Priya scored All India Rank 142 in NATA 2026 and joined SPA Delhi. Priya prepared at our Coimbatore centre. Read what our students say at neramclasses.com/reviews',
    );
    expect(text).not.toMatch(/—|--/);
    expect(successPostText({ firstName: 'Ravi', examLabel: 'JEE Paper 2', year: null, rank: null, percentile: null, college: null, centreCity: null, online: true })).toContain('Ravi cleared JEE Paper 2. Ravi prepared with Neram Classes online.');
  });
});
