// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nextLabel, promptTitle, skipSummary } from './format';

describe('promptTitle', () => {
  it('names a question as the paper does when the teacher gave its number', () => {
    expect(promptTitle({ sequence: 1, label: '38' })).toBe('Q.38');
    expect(promptTitle({ sequence: 1, label: ' 38 ' })).toBe('Q.38');
    expect(promptTitle({ sequence: 1, label: '12b' })).toBe('Q.12b');
  });

  it('shows any other reference as typed', () => {
    expect(promptTitle({ sequence: 2, label: 'Paper 2 Q38' })).toBe('Paper 2 Q38');
    expect(promptTitle({ sequence: 2, label: 'Warm-up' })).toBe('Warm-up');
  });

  it("falls back to the pad's own count", () => {
    expect(promptTitle({ sequence: 3, label: null })).toBe('Question 3');
    expect(promptTitle({ sequence: 3, label: '  ' })).toBe('Question 3');
    expect(promptTitle({ sequence: 3 })).toBe('Question 3');
  });
});

describe('nextLabel', () => {
  it('counts on from the last number in the previous reference', () => {
    expect(nextLabel('38')).toBe('39');
    expect(nextLabel('Q38')).toBe('Q39');
    expect(nextLabel('Paper 2 Q9')).toBe('Paper 2 Q10');
    expect(nextLabel('007')).toBe('008');
  });

  it('moves past the parts of one question to the next question', () => {
    expect(nextLabel('38a')).toBe('39');
    expect(nextLabel('38 (ii)')).toBe('39');
  });

  it('suggests nothing when there is no number to count on', () => {
    expect(nextLabel('Warm-up')).toBe('');
    expect(nextLabel('')).toBe('');
    expect(nextLabel(null)).toBe('');
    expect(nextLabel(undefined)).toBe('');
  });
});

describe('skipSummary', () => {
  it("counts the reasons in the pad's own order, never naming anyone", () => {
    expect(skipSummary({ total: 3, by_reason: { cant_see: 1, dont_know: 2 } })).toBe("3 can't answer: 2 don't know, 1 can't see it");
    expect(skipSummary({ total: 1, by_reason: { other: 1 } })).toBe("1 can't answer: 1 other");
  });

  it('says nothing when nobody gave a reason', () => {
    expect(skipSummary({ total: 0, by_reason: {} })).toBe('');
    expect(skipSummary(null)).toBe('');
  });
});
