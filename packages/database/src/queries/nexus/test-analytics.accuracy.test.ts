import { describe, it, expect, vi } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';

/**
 * "% right" on a question bank row: the measured difficulty that replaced the
 * hand-set Easy/Medium/Hard label nobody filled in.
 */

vi.mock('../../client', () => ({
  getSupabaseAdminClient: () => {
    throw new Error('the test must pass its own client');
  },
}));

import { getBankQuestionAccuracy } from './test-analytics';
import { examRelevanceMatch } from './question-bank';

const QUESTION = { id: 'q1', correct_answer: 'b', question_format: 'MCQ', answer_tolerance: null };

function attempt(studentId: string, answer: string, over: Record<string, unknown> = {}) {
  return {
    test_id: 't1',
    student_id: studentId,
    attempt_number: 1,
    status: 'submitted',
    mode: 'official',
    submitted_at: '2026-09-01T10:00:00Z',
    answers: { q1: answer },
    ...over,
  };
}

describe('getBankQuestionAccuracy', () => {
  it('counts each student once, on their first answer', async () => {
    const db = createFakeDb({
      nexus_test_questions: [{ test_id: 't1', qb_question_id: 'q1' }],
      nexus_qb_questions: [QUESTION],
      nexus_test_draws: [],
      nexus_test_attempts: [
        attempt('u1', 'a', { submitted_at: '2026-09-01T10:00:00Z' }),
        // A retake after seeing the solution must not flatter the question.
        attempt('u1', 'b', { attempt_number: 2, submitted_at: '2026-09-02T10:00:00Z' }),
        attempt('u2', 'b'),
      ],
    });

    const map = await getBankQuestionAccuracy(['q1'], db.client);
    expect(map.get('q1')).toEqual({ answered: 2, correct: 1 });
  });

  it('reads a shuffled sitting back through its draw', async () => {
    const db = createFakeDb({
      nexus_test_questions: [{ test_id: 't1', qb_question_id: 'q1' }],
      nexus_qb_questions: [QUESTION],
      // Displayed (d) is the bank's (b) for this student.
      nexus_test_draws: [
        { test_id: 't1', student_id: 'u1', attempt_number: 1, question_ids: ['q1'], option_maps: { q1: ['d', 'a', 'c', 'b'] } },
      ],
      nexus_test_attempts: [attempt('u1', 'd')],
    });

    const map = await getBankQuestionAccuracy(['q1'], db.client);
    expect(map.get('q1')).toEqual({ answered: 1, correct: 1 });
  });

  it('returns nothing for a question no test has used', async () => {
    const db = createFakeDb({ nexus_test_questions: [], nexus_qb_questions: [QUESTION] });
    const map = await getBankQuestionAccuracy(['q1'], db.client);
    expect(map.size).toBe(0);
  });
});

describe('examRelevanceMatch', () => {
  it('includes questions set for both exams when filtering on one', () => {
    expect(examRelevanceMatch('NATA')).toEqual(['NATA', 'BOTH']);
    expect(examRelevanceMatch('JEE')).toEqual(['JEE', 'BOTH']);
  });

  it('keeps an explicit BOTH filter exact', () => {
    expect(examRelevanceMatch('BOTH')).toEqual(['BOTH']);
  });
});
