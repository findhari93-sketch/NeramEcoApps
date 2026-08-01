import { describe, it, expect } from 'vitest';
import { autoMarkAnswers, combineMarks, type GradableQuestion } from './assignment-grading';

/** The real coordinate geometry paper: one proof, three numerical answers. */
const PAPER: GradableQuestion[] = [
  { id: 'q1', format: 'SUBJECTIVE', marks: 5 },
  { id: 'q2', format: 'NUMERICAL', marks: 5, correct_answer: '9' },
  { id: 'q3', format: 'NUMERICAL', marks: 5, correct_answer: '14' },
  { id: 'q4', format: 'NUMERICAL', marks: 5, correct_answer: '24' },
];

describe('autoMarkAnswers', () => {
  it('marks the objective half and reserves the proof for the teacher', () => {
    const result = autoMarkAnswers(PAPER, { q2: '9', q3: '14', q4: '24' });
    expect(result.auto_awarded).toBe(15);
    expect(result.auto_possible).toBe(15);
    expect(result.manual_possible).toBe(5);
    expect(result.needs_teacher).toEqual(['q1']);
  });

  it("reproduces Abhitha's sign error: a negative answer scores zero", () => {
    // The mistake that started all of this. -14 is not 14.
    const result = autoMarkAnswers(PAPER, { q2: '9', q3: '-14', q4: '24' });
    expect(result.auto_awarded).toBe(10);
    const q3 = result.outcomes.find((o) => o.question_id === 'q3');
    expect(q3?.correct).toBe(false);
    expect(q3?.marks_awarded).toBe(0);
    expect(q3?.answer).toBe('-14');
  });

  it('never awards marks for a question a machine must not mark', () => {
    // The failure that matters most: if a SUBJECTIVE question scored itself
    // correct, pressing submit would be worth full marks.
    const result = autoMarkAnswers(PAPER, { q1: 'I proved it, honestly' });
    const q1 = result.outcomes.find((o) => o.question_id === 'q1');
    expect(q1?.correct).toBeNull();
    expect(q1?.marks_awarded).toBe(0);
    expect(result.auto_awarded).toBe(0);
  });

  it('treats an unanswered question as wrong, not as unmarkable', () => {
    const result = autoMarkAnswers(PAPER, {});
    expect(result.auto_awarded).toBe(0);
    expect(result.outcomes.find((o) => o.question_id === 'q2')?.correct).toBe(false);
    // Only the genuinely subjective one waits for a teacher.
    expect(result.needs_teacher).toEqual(['q1']);
  });

  it('applies numerical tolerance', () => {
    const paper: GradableQuestion[] = [
      { id: 'a', format: 'NUMERICAL', marks: 2, correct_answer: '3.14159', answer_tolerance: 0.01 },
    ];
    expect(autoMarkAnswers(paper, { a: '3.14' }).auto_awarded).toBe(2);
    expect(autoMarkAnswers(paper, { a: '3.1' }).auto_awarded).toBe(0);
  });

  it('accepts 3.0 for 3 with no tolerance set', () => {
    const paper: GradableQuestion[] = [{ id: 'a', format: 'NUMERICAL', marks: 1, correct_answer: '3' }];
    expect(autoMarkAnswers(paper, { a: '3.0' }).auto_awarded).toBe(1);
  });

  it('marks MCQ answers case-insensitively', () => {
    const paper: GradableQuestion[] = [{ id: 'a', format: 'MCQ', marks: 4, correct_answer: 'b' }];
    expect(autoMarkAnswers(paper, { a: 'B' }).auto_awarded).toBe(4);
    expect(autoMarkAnswers(paper, { a: 'c' }).auto_awarded).toBe(0);
  });

  it('sends an unrecognised format to the teacher rather than guessing', () => {
    const paper: GradableQuestion[] = [{ id: 'a', format: 'ESSAY', marks: 6 }];
    const result = autoMarkAnswers(paper, { a: 'anything' });
    expect(result.needs_teacher).toEqual(['a']);
    expect(result.auto_awarded).toBe(0);
    expect(result.manual_possible).toBe(6);
  });

  it('handles a paper with no questions', () => {
    const result = autoMarkAnswers([], {});
    expect(result.auto_awarded).toBe(0);
    expect(result.auto_possible).toBe(0);
    expect(result.outcomes).toEqual([]);
  });
});

describe('combineMarks', () => {
  const auto = autoMarkAnswers(PAPER, { q2: '9', q3: '14', q4: '24' });

  it('adds the teacher marks to the auto marks', () => {
    expect(combineMarks(auto, 4)).toBe(19);
  });

  it('treats an unmarked proof as zero rather than blocking the total', () => {
    expect(combineMarks(auto, null)).toBe(15);
  });

  it('clamps a teacher mark above what was reserved for them', () => {
    // A mistyped 50 in a box worth 5 must not push the student past the total.
    expect(combineMarks(auto, 50)).toBe(20);
  });

  it('clamps a negative teacher mark to zero', () => {
    expect(combineMarks(auto, -3)).toBe(15);
  });

  it('rounds away float noise so students never see 14.999999', () => {
    const paper: GradableQuestion[] = [
      { id: 'a', format: 'NUMERICAL', marks: 0.1, correct_answer: '1' },
      { id: 'b', format: 'NUMERICAL', marks: 0.2, correct_answer: '2' },
    ];
    const result = autoMarkAnswers(paper, { a: '1', b: '2' });
    expect(combineMarks(result, 0)).toBe(0.3);
  });
});
