import { describe, it, expect } from 'vitest';
import {
  gradeQBAnswerStrict,
  isGradableFormat,
  normaliseQuestionFormat,
  checkQBAnswer,
} from './question-bank';

/**
 * The strict grader for composed tests.
 *
 * Every case below is a bug that was live before this function existed. The
 * grader in gradeTestOneShot compared `selected === q.correct_answer`: case
 * sensitive, whitespace sensitive, tolerance free, and it never even selected
 * answer_tolerance from the bank.
 */

describe('numerical answers respect their tolerance', () => {
  it('accepts a value inside the tolerance', () => {
    // |3.14 - 3.1416| = 0.0016
    expect(gradeQBAnswerStrict('NUMERICAL', '3.14', '3.1416', 0.01)).toBe(true);
  });

  it('rejects a value outside the tolerance', () => {
    expect(gradeQBAnswerStrict('NUMERICAL', '3.14', '3.1416', 0.001)).toBe(false);
  });

  it('accepts exactly at the tolerance boundary', () => {
    expect(gradeQBAnswerStrict('NUMERICAL', '3.14', '3.1416', 0.0016)).toBe(true);
  });

  it('compares as numbers, not strings, when there is no tolerance', () => {
    // The regression the old === grader caused: a student typing 3.0 for an
    // answer keyed 3 was marked wrong.
    expect(gradeQBAnswerStrict('NUMERICAL', '3.0', '3', null)).toBe(true);
    expect(gradeQBAnswerStrict('NUMERICAL', ' 42 ', '42', null)).toBe(true);
    expect(gradeQBAnswerStrict('NUMERICAL', '3.1', '3', null)).toBe(false);
  });

  it('never throws on input that is not a number', () => {
    for (const bad of ['about three', '', '   ', 'NaN', '--5']) {
      expect(gradeQBAnswerStrict('NUMERICAL', bad, '3', 0.5)).toBe(false);
    }
  });

  it('accepts scientific notation, because parseFloat does', () => {
    expect(gradeQBAnswerStrict('NUMERICAL', '1e2', '100', null)).toBe(true);
  });

  it('treats a negative tolerance as its magnitude rather than as impossible', () => {
    expect(gradeQBAnswerStrict('NUMERICAL', '3.14', '3.1416', -0.01)).toBe(true);
  });
});

describe('self-assessed formats are never silently marked correct', () => {
  it('returns null, never true, for a drawing prompt', () => {
    // The trap this whole function exists to avoid. checkQBAnswer returns TRUE
    // unconditionally for these two formats, because single-question practice
    // self-assesses. Reusing it in a graded test would award full marks to
    // anyone who pressed submit.
    expect(checkQBAnswer('DRAWING_PROMPT', 'anything', 'x')).toBe(true);
    expect(gradeQBAnswerStrict('DRAWING_PROMPT', 'anything', 'x')).toBeNull();
  });

  it('returns null, never true, for an image-based question', () => {
    expect(checkQBAnswer('IMAGE_BASED', 'anything', 'x')).toBe(true);
    expect(gradeQBAnswerStrict('IMAGE_BASED', 'anything', 'x')).toBeNull();
  });

  it('returns null for formats with no machine answer key in this engine', () => {
    expect(gradeQBAnswerStrict('true_false', 'true', 'true')).toBeNull();
    expect(gradeQBAnswerStrict('short_answer', 'a', 'a')).toBeNull();
  });
});

describe('legacy lowercase formats grade correctly', () => {
  it('grades a legacy mcq row as MCQ', () => {
    // nexus_verified_questions.question_type is lowercase, and
    // getComposedTestQuestions passes whichever field it finds straight through.
    // Before normalisation these fell to checkQBAnswer's `default: return false`
    // and marked EVERY answer wrong regardless of what the student picked.
    expect(gradeQBAnswerStrict('mcq', 'B', 'b')).toBe(true);
    expect(checkQBAnswer('mcq' as any, 'B', 'b')).toBe(false);
  });

  it('grades a legacy numerical row as NUMERICAL', () => {
    expect(gradeQBAnswerStrict('numerical', '3.0', '3', null)).toBe(true);
  });

  it('maps a legacy drawing row onto the non-gradable prompt format', () => {
    expect(normaliseQuestionFormat('drawing')).toBe('DRAWING_PROMPT');
    expect(gradeQBAnswerStrict('drawing', 'x', 'y')).toBeNull();
  });

  it('defaults a missing format to MCQ, matching the old fallback', () => {
    expect(normaliseQuestionFormat(null)).toBe('MCQ');
    expect(normaliseQuestionFormat('')).toBe('MCQ');
  });
});

describe('MCQ comparison is forgiving about presentation only', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(gradeQBAnswerStrict('MCQ', ' A ', 'a')).toBe(true);
  });

  it('still requires the right option', () => {
    expect(gradeQBAnswerStrict('MCQ', 'A', 'B')).toBe(false);
  });

  it('marks a missing answer wrong rather than null', () => {
    // Unanswered is wrong, not ungradable: the question itself was markable.
    expect(gradeQBAnswerStrict('MCQ', null, 'A')).toBe(false);
    expect(gradeQBAnswerStrict('NUMERICAL', undefined, '3')).toBe(false);
  });
});

describe('isGradableFormat gates what may go into a prep test', () => {
  it('accepts only the two formats a machine can mark', () => {
    expect(isGradableFormat('MCQ')).toBe(true);
    expect(isGradableFormat('NUMERICAL')).toBe(true);
    expect(isGradableFormat('mcq')).toBe(true);
    expect(isGradableFormat('DRAWING_PROMPT')).toBe(false);
    expect(isGradableFormat('IMAGE_BASED')).toBe(false);
    expect(isGradableFormat('short_answer')).toBe(false);
  });
});

describe('the marks denominator excludes what cannot be marked', () => {
  it('scores a 10-question paper holding one drawing prompt out of 9', () => {
    // This mirrors the loop in gradeTestOneShot: a question whose verdict is
    // null contributes to neither the score nor the total, so one stray prompt
    // cannot make a paper unpassable and cannot hand out free marks either.
    const paper = [
      ...Array.from({ length: 9 }, (_, i) => ({
        format: 'MCQ',
        marks: 1,
        answer: 'a',
        key: i < 7 ? 'a' : 'b',
      })),
      { format: 'DRAWING_PROMPT', marks: 1, answer: 'whatever', key: 'x' },
    ];

    let score = 0;
    let total = 0;
    for (const q of paper) {
      const verdict = gradeQBAnswerStrict(q.format, q.answer, q.key);
      if (verdict === null) continue;
      total += q.marks;
      if (verdict) score += q.marks;
    }

    expect(total).toBe(9);
    expect(score).toBe(7);
  });
});
