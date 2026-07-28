import { describe, it, expect } from 'vitest';
import { isPhotoReviewable, filterPhotoRoster } from './photo-roster';

/**
 * Regression cover for the live classroom, 2026-07-28. Four enrolled students had
 * no Microsoft account and were sitting in the review grid showing the Google
 * account picture that came in with their signup. Three of them were also
 * duplicates of a real @neramclasses.com row, so the same person appeared twice.
 */

const student = (over: Partial<Parameters<typeof isPhotoReviewable>[0]> = {}) => ({
  id: 'u1',
  ms_oid: 'oid-1',
  is_alumni: false,
  ...over,
});

describe('isPhotoReviewable', () => {
  it('accepts an ordinary enrolled student with a Microsoft account', () => {
    expect(isPhotoReviewable(student())).toBe(true);
  });

  it('rejects a student with no Microsoft account', () => {
    // CHETANA: paid through the marketing link, no mailbox yet, never opened Nexus.
    expect(isPhotoReviewable(student({ ms_oid: null }))).toBe(false);
    expect(isPhotoReviewable(student({ ms_oid: '' }))).toBe(false);
    expect(isPhotoReviewable(student({ ms_oid: undefined }))).toBe(false);
  });

  it('rejects alumni even when they still hold a Microsoft account', () => {
    expect(isPhotoReviewable(student({ is_alumni: true }))).toBe(false);
  });

  it('treats a missing alumni flag as not-alumni rather than dropping the row', () => {
    // The column is nullable, and a null must not quietly empty the queue.
    expect(isPhotoReviewable(student({ is_alumni: null }))).toBe(true);
    expect(isPhotoReviewable(student({ is_alumni: undefined }))).toBe(true);
  });

  it('keeps the Playwright fixtures reviewable', () => {
    expect(isPhotoReviewable(student({ ms_oid: 'test-oid-1773369067505' }))).toBe(true);
  });

  it('rejects nothing at all', () => {
    expect(isPhotoReviewable(null)).toBe(false);
    expect(isPhotoReviewable(undefined)).toBe(false);
  });
});

describe('filterPhotoRoster', () => {
  it('drops the nulls a failed PostgREST embed leaves behind', () => {
    expect(filterPhotoRoster([null, undefined, student()])).toHaveLength(1);
  });

  it('keeps everyone who can sign in and drops everyone who cannot', () => {
    const roster = [
      student({ id: 'anuvika', ms_oid: 'oid-anuvika' }),
      student({ id: 'chetana', ms_oid: null }),
      student({ id: 'graduated', is_alumni: true }),
      student({ id: 'ooveya', ms_oid: 'oid-ooveya' }),
    ];
    expect(filterPhotoRoster(roster).map((u) => u.id)).toEqual(['anuvika', 'ooveya']);
  });

  it('returns an empty roster rather than throwing on an empty input', () => {
    expect(filterPhotoRoster([])).toEqual([]);
  });
});
