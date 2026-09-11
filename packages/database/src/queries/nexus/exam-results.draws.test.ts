import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';

/**
 * The exam results section breakdown re-marks stored answers, because the
 * attempt row keeps the answers but not per-question verdicts.
 *
 * A scheduled exam that shuffles within sections also permutes every option,
 * and the stored answer is the letter the student CLICKED. Re-marked raw, the
 * section averages came out near chance while the total beside them (read off
 * the attempt row, graded through the draw at submit) looked right, so nothing
 * on the screen disagreed loudly enough to notice.
 */

const composed = vi.hoisted(() => ({ current: [] as any[] }));

vi.mock('./test-repository', async () => {
  const actual = await vi.importActual<typeof import('./test-repository')>('./test-repository');
  return {
    ...actual,
    getComposedTestQuestions: vi.fn(async () => composed.current),
  };
});

vi.mock('./exams', () => ({
  getExam: vi.fn(async () => ({
    id: 'exam-1',
    test_id: 't1',
    closes_at: '2026-08-18T00:00:00Z',
    passing_pct: 50,
  })),
}));

vi.mock('../../client', () => ({
  getSupabaseAdminClient: () => {
    throw new Error('the test must pass its own client');
  },
}));

import { getExamResults } from './exam-results';

const mcq = (id: string, section: string, order: number, correct: string) => ({
  question_id: id,
  question_format: 'MCQ',
  options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  marks: 4,
  negative_marks: 0,
  section,
  section_order: order,
  correct_answer: correct,
});

const ATTEMPT = {
  id: 'att-1',
  test_id: 't1',
  student_id: 'u1',
  status: 'submitted',
  mode: 'official',
  attempt_number: 1,
  score: 8,
  total_marks: 8,
  percentage: 100,
  final_score: null,
  final_total_marks: null,
  final_percentage: null,
  finalised_at: null,
  time_spent_seconds: 600,
  // Displayed letters. Under the draw below both are the correct option.
  answers: { q1: 'b', q2: 'a' },
};

const DRAW = {
  test_id: 't1',
  student_id: 'u1',
  attempt_number: 1,
  question_ids: ['q1', 'q2'],
  // Original ids in displayed order: displayed (b) is q1's 'a', displayed (a) is q2's 'c'.
  option_maps: { q1: ['b', 'a', 'c', 'd'], q2: ['c', 'd', 'a', 'b'] },
};

const ROSTER = [{ id: 'u1', name: 'Asha Kumar' }];

beforeEach(() => {
  composed.current = [mcq('q1', 'math_mcq', 1, 'a'), mcq('q2', 'aptitude', 2, 'c')];
});

function sectionScore(result: Awaited<ReturnType<typeof getExamResults>>, section: string) {
  return result.rows[0].section_scores.find((s) => s.section === section)?.score;
}

describe('getExamResults on a shuffled exam', () => {
  it('marks each section on the options the student actually chose', async () => {
    const db = createFakeDb({ nexus_test_attempts: [ATTEMPT], nexus_test_draws: [DRAW] });

    const result = await getExamResults('exam-1', ROSTER, db.client);

    expect(sectionScore(result, 'math_mcq')).toBe(4);
    expect(sectionScore(result, 'aptitude')).toBe(4);
    // The total was always right; it comes from the attempt row.
    expect(result.rows[0].percentage).toBe(100);
  });

  it('would have zeroed both sections without the draw', async () => {
    // The pin: the same clicks with the draw row missing disagree with the
    // 100% total sitting right beside them.
    const db = createFakeDb({ nexus_test_attempts: [ATTEMPT], nexus_test_draws: [] });

    const result = await getExamResults('exam-1', ROSTER, db.client);

    expect(sectionScore(result, 'math_mcq')).toBe(0);
    expect(sectionScore(result, 'aptitude')).toBe(0);
  });
});
