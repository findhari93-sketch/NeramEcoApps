import { describe, it, expect } from 'vitest';
import { gradeComposedAnswers, gradeAgainstDraw } from './test-repository';
import type { NexusTestDraw } from './test-repository';

/**
 * negative_marks has been stored on nexus_test_questions since the table was
 * created and read by nobody, so every paper in the product marked as if it
 * were unpenalised. These tests pin the rules now that it is applied.
 */

const q = (
  id: string,
  correct: string,
  marks: number,
  negative: number,
  format = 'MCQ',
): any => ({
  test_question_id: `tq-${id}`,
  question_id: id,
  question_text: id,
  question_image_url: null,
  question_format: format,
  options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  marks,
  negative_marks: negative,
  section: 'math_mcq',
  section_order: 1,
  sort_order: 0,
  correct_answer: correct,
});

describe('gradeComposedAnswers with negative marking', () => {
  it('awards the full marks for a correct answer', () => {
    const out = gradeComposedAnswers([q('1', 'a', 4, 1)], { '1': 'a' }, null);
    expect(out.score).toBe(4);
    expect(out.total_marks).toBe(4);
    expect(out.review[0].marks_awarded).toBe(4);
  });

  it('deducts for a wrong answer that was actually given', () => {
    const out = gradeComposedAnswers([q('1', 'a', 4, 1), q('2', 'a', 4, 1)], { '1': 'a', '2': 'b' }, null);
    expect(out.score).toBe(3); // +4 then -1
    expect(out.total_marks).toBe(8);
    expect(out.review[1].marks_awarded).toBe(-1);
  });

  it('never penalises an unanswered question', () => {
    // Leaving a question blank is a legitimate strategy under negative marking.
    // Charging for it would invert the very thing the paper is testing.
    const out = gradeComposedAnswers([q('1', 'a', 4, 1)], {}, null);
    expect(out.score).toBe(0);
    expect(out.review[0].marks_awarded).toBe(0);
  });

  it('treats a whitespace-only answer as unanswered', () => {
    const out = gradeComposedAnswers([q('1', 'a', 4, 1)], { '1': '   ' }, null);
    expect(out.review[0].marks_awarded).toBe(0);
  });

  it('is a no-op for every existing test, where the penalty is zero', () => {
    const out = gradeComposedAnswers([q('1', 'a', 1, 0), q('2', 'a', 1, 0)], { '1': 'a', '2': 'b' }, null);
    expect(out.score).toBe(1);
    expect(out.percentage).toBe(50);
    expect(out.review[1].marks_awarded).toBe(0);
  });

  it('treats a hand-edited negative penalty as its magnitude, never a bonus', () => {
    const out = gradeComposedAnswers([q('1', 'a', 4, -1)], { '1': 'b' }, null);
    expect(out.score).toBe(0);
    expect(out.review[0].marks_awarded).toBe(-1);
  });

  it('floors the paper at zero rather than reporting a negative score', () => {
    // Nothing downstream is ready for a negative: percentage lands in a
    // NUMERIC(5,2), feeds every average and the leaderboard.
    const out = gradeComposedAnswers(
      [q('1', 'a', 4, 1), q('2', 'a', 4, 1), q('3', 'a', 4, 1)],
      { '1': 'b', '2': 'b', '3': 'b' },
      null,
    );
    expect(out.score).toBe(0);
    expect(out.percentage).toBe(0);
    expect(out.percentage).toBeGreaterThanOrEqual(0);
  });

  it('never penalises a question no machine can mark', () => {
    const drawing = q('d', '', 50, 1, 'DRAWING_PROMPT');
    const out = gradeComposedAnswers([drawing], { d: 'https://an-image' }, null);

    expect(out.total_marks).toBe(0); // excluded from the denominator, as before
    expect(out.score).toBe(0);
    expect(out.review[0].is_gradable).toBe(false);
    expect(out.review[0].marks_awarded).toBe(0);
  });

  it('keeps one ungraded drawing from making a paper unpassable', () => {
    const out = gradeComposedAnswers(
      [q('1', 'a', 4, 1), q('d', '', 50, 0, 'DRAWING_PROMPT')],
      { '1': 'a' },
      60,
    );
    expect(out.total_marks).toBe(4);
    expect(out.percentage).toBe(100);
    expect(out.passed).toBe(true);
  });

  it('marks a full JEE-shaped paper the way the real one does', () => {
    // 2 right, 1 wrong, 1 skipped at +4/-1 = 8 - 1 = 7 out of 16.
    const questions = [q('1', 'a', 4, 1), q('2', 'a', 4, 1), q('3', 'a', 4, 1), q('4', 'a', 4, 1)];
    const out = gradeComposedAnswers(questions, { '1': 'a', '2': 'a', '3': 'b' }, null);
    expect(out.score).toBe(7);
    expect(out.total_marks).toBe(16);
    expect(out.percentage).toBe(43.75);
  });
});

/**
 * gradeAgainstDraw is the grading core factored out of submitAttempt so a
 * read-only replay of a past attempt (the teacher response sheet) can never
 * disagree with what the student was actually told at submit time.
 */
describe('gradeAgainstDraw', () => {
  it('matches gradeComposedAnswers exactly when there is no draw', () => {
    const questions = [q('1', 'a', 4, 1), q('2', 'a', 4, 1)];
    const answers = { '1': 'a', '2': 'b' };
    const direct = gradeComposedAnswers(questions, answers, 50);
    const viaDraw = gradeAgainstDraw(questions, null, answers, 50);

    expect(viaDraw.score).toBe(direct.score);
    expect(viaDraw.total_marks).toBe(direct.total_marks);
    expect(viaDraw.percentage).toBe(direct.percentage);
    expect(viaDraw.passed).toBe(direct.passed);
    expect(viaDraw.review).toEqual(direct.review);
  });

  it('translates a permuted submission back to the bank lettering to grade, then back to displayed lettering for the review', () => {
    // Question 1's correct answer is originally 'a'. This draw relabels its
    // options so displayed 'b' is the one the student must click, and
    // displayed 'a' is what used to be option 'b'.
    const question = q('1', 'a', 4, 0);
    const draw: NexusTestDraw = {
      attempt_number: 1,
      question_ids: ['1'],
      option_maps: { '1': ['b', 'a', 'c', 'd'] },
    };

    // The student, shown the permuted paper, clicks displayed 'b' — the
    // option that is actually correct under this permutation.
    const out = gradeAgainstDraw([question], draw, { '1': 'b' }, null);

    expect(out.review[0].is_correct).toBe(true);
    expect(out.score).toBe(4);
    // The review is handed back in DISPLAYED lettering, the same the student
    // saw: what they clicked and what was correct both read 'b'.
    expect(out.review[0].selected).toBe('b');
    expect(out.review[0].correct_answer).toBe('b');
  });

  it('grades a wrong permuted answer as wrong, in displayed lettering', () => {
    const question = q('1', 'a', 4, 0);
    const draw: NexusTestDraw = {
      attempt_number: 1,
      question_ids: ['1'],
      option_maps: { '1': ['b', 'a', 'c', 'd'] },
    };

    // The student clicks displayed 'a' — under this permutation, the option
    // that used to be 'b', which is wrong.
    const out = gradeAgainstDraw([question], draw, { '1': 'a' }, null);

    expect(out.review[0].is_correct).toBe(false);
    expect(out.review[0].selected).toBe('a');
    expect(out.review[0].correct_answer).toBe('b');
  });
});
