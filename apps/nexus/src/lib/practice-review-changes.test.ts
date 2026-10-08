import { describe, expect, it } from 'vitest';
import { hasPracticeChanges, type PracticeReviewBaseline, type PracticeReviewFields } from './practice-review-changes';

const fields: PracticeReviewFields = {
  rating: 0, marks: null, tutorFeedback: '', overlayImageUrl: null, correctedImageUrl: null, resources: [], reaction: null,
};
const baseline: PracticeReviewBaseline = { fields, tags: ['Perspective'], regionCount: 0 };
const current = (over: Partial<PracticeReviewFields> = {}, rest: { tags?: string[]; regionCount?: number; unsentVoice?: boolean } = {}) => ({
  fields: { ...fields, ...over },
  tags: rest.tags ?? ['Perspective'],
  regionCount: rest.regionCount ?? 0,
  unsentVoice: rest.unsentVoice ?? false,
});

describe('hasPracticeChanges', () => {
  it('reads an untouched sheet as unchanged', () => {
    expect(hasPracticeChanges(baseline, current())).toBe(false);
  });
  it('ignores whitespace and tag case, which the save would not change', () => {
    expect(hasPracticeChanges(baseline, current({ tutorFeedback: '  ' }, { tags: ['perspective '] }))).toBe(false);
  });
  it('counts a reaction, stars, words, markup or a resource', () => {
    expect(hasPracticeChanges(baseline, current({ reaction: 'wow' }))).toBe(true);
    expect(hasPracticeChanges(baseline, current({ rating: 4 }))).toBe(true);
    expect(hasPracticeChanges(baseline, current({ tutorFeedback: 'Lighter lines' }))).toBe(true);
    expect(hasPracticeChanges(baseline, current({ overlayImageUrl: 'https://x/overlay.jpg' }))).toBe(true);
    expect(hasPracticeChanges(baseline, current({ resources: [{ url: 'https://x' }] }))).toBe(true);
  });
  it('counts a changed reaction on a sketch that already had one', () => {
    const had = { ...baseline, fields: { ...fields, reaction: 'heart' } };
    expect(hasPracticeChanges(had, current({ reaction: 'heart' }))).toBe(false);
    expect(hasPracticeChanges(had, current({ reaction: 'fire' }))).toBe(true);
  });
  it('counts tags and region boxes', () => {
    expect(hasPracticeChanges(baseline, current({}, { tags: ['Perspective', 'Shading'] }))).toBe(true);
    expect(hasPracticeChanges(baseline, current({}, { regionCount: 2 }))).toBe(true);
  });
  it('counts a voice note waiting to go out, even before the sheet has loaded', () => {
    expect(hasPracticeChanges(baseline, current({}, { unsentVoice: true }))).toBe(true);
    expect(hasPracticeChanges(null, current({}, { unsentVoice: true }))).toBe(true);
    expect(hasPracticeChanges(null, current({ rating: 5 }))).toBe(false);
  });
});
