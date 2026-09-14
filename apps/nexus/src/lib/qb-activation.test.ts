import { describe, it, expect } from 'vitest';
import {
  activationMessage,
  canActivateQuestion,
  splitForActivation,
  statusAfterAnswerSave,
} from './qb-activation';

describe('canActivateQuestion', () => {
  /**
   * The prod case this was written for: JEE Paper 2 2007 Q76 and Q77 carry
   * keys b and c, but their `status` still reads 'draft'. Activate filtered on
   * status, updated nothing, and told the teacher they had no answer key.
   */
  it('lets a draft MCQ that has an answer key through, whatever its status says', () => {
    expect(canActivateQuestion({ question_format: 'MCQ', correct_answer: 'b' })).toBe(true);
  });

  it('holds back an MCQ with no key', () => {
    expect(canActivateQuestion({ question_format: 'MCQ', correct_answer: null })).toBe(false);
    expect(canActivateQuestion({ question_format: 'MCQ', correct_answer: '   ' })).toBe(false);
  });

  it('holds back a numerical question with no key', () => {
    expect(canActivateQuestion({ question_format: 'NUMERICAL', correct_answer: '' })).toBe(false);
    expect(canActivateQuestion({ question_format: 'NUMERICAL', correct_answer: '42' })).toBe(true);
  });

  it('never waits on a key for a drawing, which has none', () => {
    expect(canActivateQuestion({ question_format: 'DRAWING_PROMPT', correct_answer: null })).toBe(true);
  });
});

describe('splitForActivation', () => {
  it('separates the questions that can go live from the ones still owed a key', () => {
    const rows = [
      { id: 'q76', question_format: 'MCQ', correct_answer: 'b' },
      { id: 'q90', question_format: 'MCQ', correct_answer: null },
      { id: 'd1', question_format: 'DRAWING_PROMPT', correct_answer: null },
    ];
    const { ready, blocked } = splitForActivation(rows);
    expect(ready.map((r) => r.id)).toEqual(['q76', 'd1']);
    expect(blocked.map((r) => r.id)).toEqual(['q90']);
  });
});

/**
 * How Q76 and Q77 drifted. The edit form saves through PATCH questions/[id],
 * which wrote `correct_answer` and never `status`, so a draft keyed there
 * stayed 'draft'. The paper JSON import already moved it; this is the same rule
 * for a single save.
 */
describe('statusAfterAnswerSave', () => {
  const draftMcq = { status: 'draft', question_format: 'MCQ', correct_answer: null };

  it('moves a draft to answer_keyed when its key arrives', () => {
    expect(statusAfterAnswerSave(draftMcq, { correct_answer: 'b' })).toBe('answer_keyed');
  });

  it('leaves the status alone when the save does not touch the key', () => {
    expect(statusAfterAnswerSave(draftMcq, {})).toBeNull();
  });

  it('does not count a blank answer as a key', () => {
    expect(statusAfterAnswerSave(draftMcq, { correct_answer: '  ' })).toBeNull();
  });

  it('sends a keyed question back to draft when its key is cleared', () => {
    const keyed = { status: 'answer_keyed', question_format: 'MCQ', correct_answer: 'b' };
    expect(statusAfterAnswerSave(keyed, { correct_answer: '' })).toBe('draft');
  });

  it('keeps complete when a key is only corrected, not removed', () => {
    const complete = { status: 'complete', question_format: 'MCQ', correct_answer: 'b' };
    expect(statusAfterAnswerSave(complete, { correct_answer: 'c' })).toBeNull();
  });

  it('never touches a live question', () => {
    const live = { status: 'active', question_format: 'MCQ', correct_answer: 'b' };
    expect(statusAfterAnswerSave(live, { correct_answer: '' })).toBeNull();
  });

  it('reads the format this save sends, not only the stored one', () => {
    expect(statusAfterAnswerSave(draftMcq, { question_format: 'DRAWING_PROMPT', correct_answer: null })).toBe(
      'complete',
    );
  });
});

describe('activationMessage', () => {
  it('confirms a full activation', () => {
    expect(activationMessage({ active: true, requested: 2, updated: 2, blocked: 0 })).toBe(
      '2 questions activated',
    );
  });

  it('names the real reason when some were held back', () => {
    expect(activationMessage({ active: true, requested: 3, updated: 2, blocked: 1 })).toBe(
      '2 of 3 activated. 1 still needs an answer key.',
    );
  });

  it('says what to do when none could go live', () => {
    expect(activationMessage({ active: true, requested: 1, updated: 0, blocked: 1 })).toBe(
      'Not activated. Add the correct answer first.',
    );
  });

  /**
   * The old toast blamed a missing key for every shortfall. A shortfall with
   * no blocked rows is something else (a row gone since the list loaded), and
   * saying "no answer key" there sends the teacher to fix the wrong thing.
   */
  it('does not blame the answer key for a shortfall it did not cause', () => {
    expect(activationMessage({ active: true, requested: 2, updated: 1, blocked: 0 })).toBe(
      '1 of 2 activated. Refresh and try again.',
    );
  });

  it('confirms a deactivation', () => {
    expect(activationMessage({ active: false, requested: 1, updated: 1, blocked: 0 })).toBe(
      '1 question hidden from students',
    );
  });
});
