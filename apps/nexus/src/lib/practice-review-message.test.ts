import { describe, expect, it } from 'vitest';
import { buildPracticeReviewMessage, shouldNotifyPractice } from './practice-review-message';

const base = { action: 'complete' as const, previouslyReviewed: false, previousStatus: 'completed', previousRating: null, rating: 4, previousFeedback: null, feedback: 'Good lines' };

describe('shouldNotifyPractice', () => {
  it('tells the student about a first review', () => {
    expect(shouldNotifyPractice(base)).toBe(true);
  });
  it('stays quiet when a review is saved again unchanged', () => {
    expect(shouldNotifyPractice({ ...base, previouslyReviewed: true, previousRating: 4, previousFeedback: 'Good lines' })).toBe(false);
  });
  it('tells the student when the stars or the words change', () => {
    expect(shouldNotifyPractice({ ...base, previouslyReviewed: true, previousRating: 3, previousFeedback: 'Good lines' })).toBe(true);
    expect(shouldNotifyPractice({ ...base, previouslyReviewed: true, previousRating: 4, previousFeedback: 'Good' })).toBe(true);
  });
  it('tells the student about a redo once, and when a redo is closed', () => {
    expect(shouldNotifyPractice({ ...base, action: 'redo', previousStatus: 'submitted' })).toBe(true);
    expect(shouldNotifyPractice({ ...base, action: 'redo', previousStatus: 'redo', previouslyReviewed: true })).toBe(false);
    expect(shouldNotifyPractice({ ...base, previousStatus: 'redo', previouslyReviewed: true, previousRating: 4, previousFeedback: 'Good lines' })).toBe(true);
  });
  it('tells the student when only the reaction changes, but not when it is taken away', () => {
    const same = { ...base, previouslyReviewed: true, previousRating: 4, previousFeedback: 'Good lines' };
    expect(shouldNotifyPractice({ ...same, previousReaction: 'heart', reaction: 'wow' })).toBe(true);
    expect(shouldNotifyPractice({ ...same, previousReaction: null, reaction: 'fire' })).toBe(true);
    expect(shouldNotifyPractice({ ...same, previousReaction: 'wow', reaction: 'wow' })).toBe(false);
    expect(shouldNotifyPractice({ ...same, previousReaction: 'wow', reaction: null })).toBe(false);
  });
  it('tells the student when a new voice note goes out on an unchanged review', () => {
    expect(shouldNotifyPractice({ ...base, previouslyReviewed: true, previousRating: 4, previousFeedback: 'Good lines', voiceSentNow: true })).toBe(true);
  });
});

describe('buildPracticeReviewMessage', () => {
  it('names the stars on a sketch', () => {
    const m = buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari Babu', sourceType: 'sketchbook', rating: 4 });
    expect(m.subject).toBe('Hari reviewed your sketch');
    expect(m.plain).toBe('Hari gave your sketch 4 out of 5 stars. Open it to read the feedback.');
    expect(m.buttonLabel).toBe('Open your sketchbook');
  });
  it('says feedback when there are no stars, and drawing for other practice', () => {
    const m = buildPracticeReviewMessage({ action: 'complete', teacherName: null, sourceType: 'question_bank', rating: null });
    expect(m.subject).toBe('Your teacher reviewed your drawing');
    expect(m.plain).toBe('Your teacher left feedback on your drawing. Open it to read it.');
  });
  it('carries the reaction, with or without stars', () => {
    expect(buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari', sourceType: 'sketchbook', rating: null, reaction: 'wow' }).plain)
      .toBe('Hari said Wow to your sketch. Open it to read the feedback.');
    expect(buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari', sourceType: 'question_bank', rating: 4, reaction: 'fire' }).plain)
      .toBe('Hari said Great and gave your drawing 4 out of 5 stars. Open it to read the feedback.');
  });
  it('points at the voice note when there is one', () => {
    expect(buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari', sourceType: 'sketchbook', rating: null, reaction: 'heart', hasVoice: true }).plain)
      .toBe('Hari said Nice to your sketch. Open it to hear the voice note.');
    expect(buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari', sourceType: 'sketchbook', rating: null, hasVoice: true }).plain)
      .toBe('Hari left a voice note on your sketch. Open it to listen.');
  });
  it('says updated when the student already had a review', () => {
    expect(buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari', sourceType: 'sketchbook', rating: null, reaction: 'wow', update: true }).subject)
      .toBe('Hari updated the review of your sketch');
  });
  it('asks for a redo in plain words', () => {
    const m = buildPracticeReviewMessage({ action: 'redo', teacherName: 'Hari Babu', sourceType: 'free_practice', rating: null });
    expect(m.subject).toBe('Hari asked you to try your drawing again');
    expect(m.buttonLabel).toBe('See what to change');
  });
  it('never uses a dash as punctuation', () => {
    const m = buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari', sourceType: 'sketchbook', rating: 5 });
    const emDash = String.fromCharCode(8212);
    expect(`${m.subject} ${m.plain} ${m.buttonLabel}`.includes(emDash)).toBe(false);
    expect(`${m.subject} ${m.plain} ${m.buttonLabel}`.includes('--')).toBe(false);
  });
});
