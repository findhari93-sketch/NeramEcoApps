import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { getServedTestQuestions } from './test-repository';

/**
 * A retired question must not be served in a new sitting.
 *
 * On 2026-09-09 the greeting trivia ("what was the very first word spoken",
 * "am I audible") was retired by setting nexus_qb_questions.is_active = false.
 * The class final check composes its paper from nexus_test_questions, and that
 * read never looked at is_active, so every catch-up final check built before
 * the cleanup went on serving the trivia. Found on the NXS-0130 class: 10 of its
 * 105 questions were retired and still in the pool, with 13 of 15 to pass.
 *
 * A sitting that already has a draw keeps it: the grade and the review belong to
 * the paper the student actually sat.
 */

const TEST_ID = 'test-1';
const STUDENT_ID = 'student-1';

function question(id: string, active: boolean) {
  return {
    id,
    question_text: `Question ${id}`,
    question_format: 'MCQ',
    options: [{ id: 'a' }, { id: 'b' }],
    correct_answer: 'a',
    is_active: active,
  };
}

function seed(opts: { serve: number | null; draws?: any[] }) {
  const ids = ['q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6'];
  const retired = new Set(['q-2', 'q-5']);
  return createFakeDb({
    nexus_tests: [
      {
        id: TEST_ID,
        title: 'Final check',
        test_type: 'untimed',
        questions_to_serve: opts.serve,
        shuffle_sections: false,
      },
    ],
    nexus_test_questions: ids.map((id, i) => ({
      id: `tq-${id}`,
      test_id: TEST_ID,
      qb_question_id: id,
      marks: 1,
      negative_marks: 0,
      sort_order: i,
    })),
    nexus_qb_questions: ids.map((id) => question(id, !retired.has(id))),
    nexus_test_attempts: [],
    nexus_test_draws: opts.draws ?? [],
  });
}

describe('getServedTestQuestions: retired questions stay out of new sittings', () => {
  it('draws a pooled sitting from live questions only', async () => {
    const db = seed({ serve: 3 });
    const served = await getServedTestQuestions(TEST_ID, STUDENT_ID, db.client);
    expect(served).toHaveLength(3);
    expect(served.map((q) => q.question_id)).not.toContain('q-2');
    expect(served.map((q) => q.question_id)).not.toContain('q-5');
  });

  it('leaves them out of a paper that is served whole, too', async () => {
    const db = seed({ serve: null });
    const served = await getServedTestQuestions(TEST_ID, STUDENT_ID, db.client);
    expect(served.map((q) => q.question_id)).toEqual(['q-1', 'q-3', 'q-4', 'q-6']);
  });

  it('keeps the stored order and options of a whole paper', async () => {
    const db = seed({ serve: null });
    const served = await getServedTestQuestions(TEST_ID, STUDENT_ID, db.client);
    expect(served.map((q) => (q.options as any[]).map((o) => o.id))).toEqual([
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'b'],
    ]);
  });

  it('honours a sitting that was already drawn, retired question and all', async () => {
    const db = seed({
      serve: 3,
      draws: [
        {
          id: 'draw-1',
          test_id: TEST_ID,
          student_id: STUDENT_ID,
          attempt_number: 1,
          question_ids: ['q-1', 'q-2', 'q-3'],
          option_maps: {},
        },
      ],
    });
    const served = await getServedTestQuestions(TEST_ID, STUDENT_ID, db.client);
    expect(served.map((q) => q.question_id)).toEqual(['q-1', 'q-2', 'q-3']);
  });

  it('never empties a paper whose every question was retired', async () => {
    const db = createFakeDb({
      nexus_tests: [{ id: TEST_ID, title: 'x', test_type: 'untimed', questions_to_serve: null, shuffle_sections: false }],
      nexus_test_questions: [
        { id: 'tq-1', test_id: TEST_ID, qb_question_id: 'q-1', marks: 1, negative_marks: 0, sort_order: 0 },
      ],
      nexus_qb_questions: [question('q-1', false)],
      nexus_test_attempts: [],
      nexus_test_draws: [],
    });
    const served = await getServedTestQuestions(TEST_ID, STUDENT_ID, db.client);
    expect(served).toHaveLength(1);
  });
});
