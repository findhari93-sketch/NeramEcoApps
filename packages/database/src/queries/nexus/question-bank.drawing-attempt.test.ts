import { describe, it, expect } from 'vitest';
import { submitQBAttempt, DRAWING_ATTEMPT_ERROR } from './question-bank';
import { createFakeDb } from './testing/fake-supabase';

/**
 * The bug this pins, in full.
 *
 * submitQBAttempt refused any question whose correct_answer was falsy. Every
 * drawing question in the bank has no correct_answer by design, and the
 * active_question_complete constraint was relaxed in 20260416_drawing_qb_bridge
 * specifically to allow that. So a student who pressed submit on any of the 123
 * drawing questions got a 500.
 *
 * Underneath it sat a worse one. Had the guard been loosened by truthiness
 * alone, execution would have reached checkQBAnswer, which returns TRUE
 * unconditionally for DRAWING_PROMPT. That writes is_correct = true into
 * nexus_qb_student_attempts for a sheet no teacher has looked at, and it feeds
 * getStudentQBStats' accuracy percentage. The guard is therefore on the format,
 * not on the emptiness of the answer.
 *
 * The '' case is not hypothetical: the paper workspace editor's
 * buildSubmitPayload writes '' rather than null for a drawing, so a drawing
 * saved through the teacher UI has an empty string where the plan assumed null.
 */

const STUDENT = 'student-1';

function dbWith(question: Record<string, unknown>) {
  return createFakeDb({
    nexus_qb_questions: [question],
    nexus_qb_student_attempts: [],
  });
}

describe('submitQBAttempt: drawings are not submitted here', () => {
  it('refuses a drawing whose correct_answer is null', async () => {
    const db = dbWith({
      id: 'q-draw',
      question_format: 'DRAWING_PROMPT',
      correct_answer: null,
      answer_tolerance: null,
    });

    await expect(
      submitQBAttempt(STUDENT, 'q-draw', 'https://example.test/a.jpg', 30, 'practice', db.client),
    ).rejects.toThrow(DRAWING_ATTEMPT_ERROR);

    expect(db.tables.nexus_qb_student_attempts).toHaveLength(0);
  });

  it('refuses a drawing whose correct_answer is the empty string the editor writes', async () => {
    const db = dbWith({
      id: 'q-draw',
      question_format: 'DRAWING_PROMPT',
      correct_answer: '',
      answer_tolerance: null,
    });

    await expect(
      submitQBAttempt(STUDENT, 'q-draw', 'https://example.test/a.jpg', 30, 'practice', db.client),
    ).rejects.toThrow(DRAWING_ATTEMPT_ERROR);
  });

  it('refuses a drawing even when something has written an answer onto it', async () => {
    // This is the case that would have marked an unreviewed sheet correct.
    const db = dbWith({
      id: 'q-draw',
      question_format: 'DRAWING_PROMPT',
      correct_answer: 'anything',
      answer_tolerance: null,
    });

    await expect(
      submitQBAttempt(STUDENT, 'q-draw', 'https://example.test/a.jpg', 30, 'practice', db.client),
    ).rejects.toThrow(DRAWING_ATTEMPT_ERROR);

    expect(db.tables.nexus_qb_student_attempts).toHaveLength(0);
  });

  it('refuses the legacy lowercase spelling too', async () => {
    // getComposedTestQuestions passes nexus_verified_questions' question_type
    // straight through, so 'drawing' reaches this code from older rows.
    const db = dbWith({
      id: 'q-draw',
      question_format: 'drawing',
      correct_answer: null,
      answer_tolerance: null,
    });

    await expect(
      submitQBAttempt(STUDENT, 'q-draw', 'https://example.test/a.jpg', 30, 'practice', db.client),
    ).rejects.toThrow(DRAWING_ATTEMPT_ERROR);
  });
});

describe('submitQBAttempt: everything else is unchanged', () => {
  it('still records a correct MCQ', async () => {
    const db = dbWith({
      id: 'q-mcq',
      question_format: 'MCQ',
      correct_answer: 'b',
      answer_tolerance: null,
    });

    const { isCorrect } = await submitQBAttempt(STUDENT, 'q-mcq', 'B', 12, 'practice', db.client);

    expect(isCorrect).toBe(true);
    expect(db.tables.nexus_qb_student_attempts).toHaveLength(1);
    expect(db.tables.nexus_qb_student_attempts[0].is_correct).toBe(true);
  });

  it('still records an incorrect MCQ', async () => {
    const db = dbWith({
      id: 'q-mcq',
      question_format: 'MCQ',
      correct_answer: 'b',
      answer_tolerance: null,
    });

    const { isCorrect } = await submitQBAttempt(STUDENT, 'q-mcq', 'c', 12, 'practice', db.client);

    expect(isCorrect).toBe(false);
    expect(db.tables.nexus_qb_student_attempts[0].is_correct).toBe(false);
  });

  it('still refuses an MCQ that has no answer keyed yet, with the original message', async () => {
    const db = dbWith({
      id: 'q-mcq',
      question_format: 'MCQ',
      correct_answer: null,
      answer_tolerance: null,
    });

    await expect(
      submitQBAttempt(STUDENT, 'q-mcq', 'b', 12, 'practice', db.client),
    ).rejects.toThrow('Cannot submit attempt: question has no correct answer set');
  });

  it('leaves an image-based question on its existing self-assessed path', async () => {
    // IMAGE_BASED is out of scope here. It keeps today's behaviour so this
    // change cannot alter a format it was not meant to touch.
    const db = dbWith({
      id: 'q-img',
      question_format: 'IMAGE_BASED',
      correct_answer: 'x',
      answer_tolerance: null,
    });

    const { isCorrect } = await submitQBAttempt(STUDENT, 'q-img', 'anything', 5, 'practice', db.client);

    expect(isCorrect).toBe(true);
  });
});
