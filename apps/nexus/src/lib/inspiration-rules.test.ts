import { describe, expect, it } from 'vitest';
import { hiddenReason, originalEligible, referenceEligible, scorePct, type SubmissionFacts } from './inspiration-rules';

/**
 * The TypeScript mirror of nexus_inspiration_sync_submission. If one of these
 * changes, the SQL in 20260920090100_nexus_inspiration_sync.sql changes with it.
 */
const reviewed = (over: Partial<SubmissionFacts> = {}): SubmissionFacts => ({
  source_type: 'question_bank',
  status: 'completed',
  reviewed_at: '2026-09-01T10:00:00Z',
  tutor_rating: 4,
  tutor_marks: null,
  max_marks: null,
  evaluation_type: null,
  corrected_image_url: 'https://example.com/r.jpg',
  ...over,
});

describe('scorePct', () => {
  it('reads stars out of five first, then marks out of the assignment total', () => {
    expect(scorePct(reviewed({ tutor_rating: 4 }))).toBe(0.8);
    expect(scorePct(reviewed({ tutor_rating: null, tutor_marks: 8, max_marks: 10 }))).toBe(0.8);
    expect(scorePct(reviewed({ tutor_rating: null, tutor_marks: 8, max_marks: 0 }))).toBeNull();
    expect(scorePct(reviewed({ tutor_rating: null }))).toBeNull();
  });

  it('judges a marks assignment by its marks, even when a stale star rating is present', () => {
    expect(scorePct(reviewed({ evaluation_type: 'marks', tutor_rating: 3, tutor_marks: 8, max_marks: 10 }))).toBe(0.8);
    expect(scorePct(reviewed({ evaluation_type: 'stars', tutor_rating: 3, tutor_marks: 8, max_marks: 10 }))).toBe(0.6);
  });

  it('includes a marks assignment result in originalEligible calculation', () => {
    expect(scorePct(reviewed({ evaluation_type: 'marks', tutor_rating: 5, tutor_marks: 5, max_marks: 10 }))).toBe(0.5);
  });
});

describe('originalEligible', () => {
  it('lets 4 stars and above in and keeps 3 stars out', () => {
    expect(originalEligible(reviewed({ tutor_rating: 4 }))).toBe(true);
    expect(originalEligible(reviewed({ tutor_rating: 5 }))).toBe(true);
    expect(originalEligible(reviewed({ tutor_rating: 3 }))).toBe(false);
  });

  it('counts 80 percent of the marks the same as 4 stars', () => {
    expect(originalEligible(reviewed({ tutor_rating: null, tutor_marks: 8, max_marks: 10 }))).toBe(true);
    expect(originalEligible(reviewed({ tutor_rating: null, tutor_marks: 7.5, max_marks: 10 }))).toBe(false);
  });

  it('judges a marks assignment by its marks, even when a stale star rating is present', () => {
    expect(originalEligible(reviewed({ evaluation_type: 'marks', tutor_rating: 3, tutor_marks: 8, max_marks: 10 }))).toBe(true);
    expect(originalEligible(reviewed({ evaluation_type: 'stars', tutor_rating: 3, tutor_marks: 8, max_marks: 10 }))).toBe(false);
  });

  it('needs a finished review and never lets a test drawing in', () => {
    expect(originalEligible(reviewed({ reviewed_at: null }))).toBe(false);
    expect(originalEligible(reviewed({ status: 'redo' }))).toBe(false);
    expect(originalEligible(reviewed({ source_type: 'exam', tutor_rating: 5 }))).toBe(false);
  });
});

describe('referenceEligible', () => {
  it('lets a finished review in, including a redo, whatever the stars', () => {
    expect(referenceEligible(reviewed({ tutor_rating: 1 }))).toBe(true);
    expect(referenceEligible(reviewed({ status: 'redo' }))).toBe(true);
  });

  it('needs an image, a review, and never a test drawing', () => {
    expect(referenceEligible(reviewed({ corrected_image_url: null }))).toBe(false);
    expect(referenceEligible(reviewed({ reviewed_at: null }))).toBe(false);
    expect(referenceEligible(reviewed({ source_type: 'exam' }))).toBe(false);
  });
});

describe('hiddenReason', () => {
  const base = { kind: 'submission_original' as const, curation: 'auto' as const, visible: false, scorePct: 0.6, authorOptedOut: false };

  it('says nothing for a visible drawing', () => {
    expect(hiddenReason({ ...base, visible: true })).toBeNull();
  });

  it('names the reason a teacher can act on', () => {
    expect(hiddenReason({ ...base, curation: 'hidden' })).toBe('hidden_by_teacher');
    expect(hiddenReason({ ...base, curation: 'shown', authorOptedOut: true })).toBe('opted_out');
    expect(hiddenReason({ ...base, scorePct: null })).toBe('not_rated');
    expect(hiddenReason(base)).toBe('below_threshold');
    expect(hiddenReason({ ...base, kind: 'submission_reference', scorePct: null })).toBe('review_not_finished');
  });
});
