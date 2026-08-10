import { describe, it, expect } from 'vitest';
import { needsAnswerKey, parsedQuestionStatus, originForParsedQuestion } from './question-bank';

/**
 * The bug these pin, in full.
 *
 * A drawing prompt has no answer to key, so the answer-key screen showed it as
 * "N/A" and saveAnswerKey never touched it. saveAnswerKey is the only thing
 * that sets 'answer_keyed'. bulkActivateQuestions only takes 'complete' or
 * 'answer_keyed'. loadPaperQuestionIds only takes is_active. So every drawing
 * on every past paper stayed at 'draft' forever and dropped out of every
 * generated mock, silently: JEE Paper 2 2006 reported 90 of its 92 questions
 * and 43 drawings across 18 papers had never been in a single test.
 *
 * Nothing in that chain errored, which is why it lasted. These tests are the
 * alarm that was missing.
 */

describe('needsAnswerKey', () => {
  it('says an MCQ is waiting for its answer', () => {
    expect(needsAnswerKey('MCQ')).toBe(true);
  });

  it('says a numerical is waiting for its answer', () => {
    expect(needsAnswerKey('NUMERICAL')).toBe(true);
  });

  it('says a drawing prompt is not, because a human marks it', () => {
    expect(needsAnswerKey('DRAWING_PROMPT')).toBe(false);
  });

  it('says an image question is not, for the same reason', () => {
    expect(needsAnswerKey('IMAGE_BASED')).toBe(false);
  });

  it('reads the legacy lowercase spelling too', () => {
    // getComposedTestQuestions passes nexus_verified_questions' question_type
    // straight through, so 'drawing' arrives here from older rows.
    expect(needsAnswerKey('drawing')).toBe(false);
  });
});

describe('parsedQuestionStatus', () => {
  it('lands a drawing at complete, so Activate can pick it up', () => {
    // The whole fix in one assertion. 'draft' here is what cost 43 questions.
    expect(parsedQuestionStatus('DRAWING_PROMPT', false)).toBe('complete');
  });

  it('lands an answerless MCQ at draft, which is still correct', () => {
    expect(parsedQuestionStatus('MCQ', false)).toBe('draft');
  });

  it('lands an MCQ whose answer came in the same JSON at answer_keyed', () => {
    // One paste doing questions and key together is the point: the teacher
    // never has to visit the answer-key screen for a solved paper.
    expect(parsedQuestionStatus('MCQ', true)).toBe('answer_keyed');
  });

  it('ignores an answer on a drawing rather than keying it', () => {
    expect(parsedQuestionStatus('DRAWING_PROMPT', true)).toBe('complete');
  });
});

describe('originForParsedQuestion', () => {
  it('calls a paper MCQ a past paper question', () => {
    expect(originForParsedQuestion('MCQ')).toBe('pyq');
  });

  it('calls a paper drawing a past paper question too', () => {
    // It used to answer 'authored'. Production ended up with 145 drawings at
    // 'authored' and 0 at 'pyq', so the Source filter's "Previous year papers"
    // hid the entire drawing section of every paper in the bank.
    expect(originForParsedQuestion('DRAWING_PROMPT')).toBe('pyq');
  });

  it('calls a paper numerical a past paper question', () => {
    expect(originForParsedQuestion('NUMERICAL')).toBe('pyq');
  });
});
