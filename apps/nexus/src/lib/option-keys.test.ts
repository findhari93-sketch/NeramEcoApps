import { describe, it, expect } from 'vitest';
import { optionKeyAt, sameChoice } from './option-keys';

describe('optionKeyAt', () => {
  it('prefers the label, which is what the paper is answered with', () => {
    expect(optionKeyAt({ id: 'uuid-1', label: 'A' }, 0)).toBe('A');
  });

  it('falls back to the id when there is no label', () => {
    expect(optionKeyAt({ id: 'uuid-1' }, 0)).toBe('uuid-1');
  });

  it('uses position only as a last resort', () => {
    expect(optionKeyAt({}, 2)).toBe('2');
  });
});

describe('sameChoice', () => {
  it('matches the grader: case-insensitive and trimmed', () => {
    expect(sameChoice('A', 'a')).toBe(true);
    expect(sameChoice(' b ', 'B')).toBe(true);
  });

  it('does not match different options', () => {
    expect(sameChoice('A', 'B')).toBe(false);
  });

  it('treats a missing side as no match, never as a match', () => {
    expect(sameChoice(null, null)).toBe(false);
    expect(sameChoice('A', null)).toBe(false);
    expect(sameChoice(undefined, 'A')).toBe(false);
  });

  it('is the rule the review needs for labelled options', () => {
    // The review used to compare option.id against correct_answer. On a question
    // whose options carry labels, correct_answer holds the LABEL, so the right
    // answer was highlighted as wrong on every such question.
    const option = { id: '6f0c-uuid', label: 'C' };
    const correctAnswer = 'c';
    expect(sameChoice(option.id, correctAnswer)).toBe(false);
    expect(sameChoice(optionKeyAt(option, 2), correctAnswer)).toBe(true);
  });
});
