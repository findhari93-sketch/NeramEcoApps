import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';

/**
 * Reading stored answers back through the draw the student actually sat.
 *
 * Found on a real run of a 150 question pool that serves 50 with the options
 * shuffled per sitting. The attempt rows averaged 77%. The question analysis
 * said 25% of answers were right, which is exactly chance for four options,
 * and told the teacher that 0 of 9 students got "The Indus Valley Civilization
 * is also known as" right, most picking Copper Age. All nine had answered
 * Bronze Age, the stored key. A drawn paper stores the letter the student
 * CLICKED, and the analysis compared that letter with the bank's own lettering.
 *
 * The teacher then sent 29 "broken" questions to an AI to be fixed. None were.
 */

const composed = vi.hoisted(() => ({ current: [] as any[] }));

vi.mock('./test-repository', async () => {
  const actual = await vi.importActual<typeof import('./test-repository')>('./test-repository');
  return {
    ...actual,
    getComposedTestQuestions: vi.fn(async () => composed.current),
  };
});

vi.mock('../../client', () => ({
  getSupabaseAdminClient: () => {
    throw new Error('the test must pass its own client');
  },
}));

import { getQuestionAnalysis, getStudentAccuracy, getStudentMistakeQuestionIds } from './test-analytics';

const indus = {
  question_id: 'q-indus',
  question_text: 'The Indus Valley Civilization is also known as which of the following?',
  question_format: 'MCQ',
  options: [
    { id: 'a', text: 'Iron Age civilization' },
    { id: 'b', text: 'Bronze Age civilization' },
    { id: 'c', text: 'Stone Age civilization' },
    { id: 'd', text: 'Copper Age civilization' },
  ],
  correct_answer: 'b',
  sort_order: 0,
  marks: 1,
};

/**
 * Original ids in displayed order. Under this map the student sees Copper Age
 * as (a) and Bronze Age as (d), so a student who knows the answer clicks 'd'.
 */
const INDUS_MAP = ['d', 'a', 'c', 'b'];

function attempt(studentId: string, answers: Record<string, string>, over: Record<string, unknown> = {}) {
  return {
    id: `att-${studentId}-${over.attempt_number ?? 1}`,
    test_id: 't1',
    student_id: studentId,
    attempt_number: 1,
    status: 'submitted',
    mode: 'official',
    placement_id: 'run-1',
    submitted_at: '2026-08-18T10:00:00Z',
    answers,
    ...over,
  };
}

function draw(studentId: string, optionMaps: Record<string, string[]>, over: Record<string, unknown> = {}) {
  return {
    test_id: 't1',
    student_id: studentId,
    attempt_number: 1,
    question_ids: Object.keys(optionMaps),
    option_maps: optionMaps,
    ...over,
  };
}

beforeEach(() => {
  composed.current = [indus];
});

describe('getQuestionAnalysis on a shuffled paper', () => {
  it('counts a clicked letter as the option the student actually saw', async () => {
    const db = createFakeDb({
      nexus_test_attempts: ['u1', 'u2', 'u3'].map((u) => attempt(u, { 'q-indus': 'd' })),
      nexus_test_draws: ['u1', 'u2', 'u3'].map((u) => draw(u, { 'q-indus': INDUS_MAP })),
    });

    const [row] = await getQuestionAnalysis('t1', {}, db.client);

    expect(row.answered).toBe(3);
    expect(row.correct).toBe(3);
    expect(row.correct_pct).toBe(100);
    expect(row.top_wrong_option).toBeNull();
    expect(row.needs_review).toBe(false);
    // The bars count original ids: everyone chose Bronze Age, which is 'b'.
    expect(row.option_counts).toEqual({ b: 3 });
  });

  it('names the wrong option a student really picked, not the one sharing its letter', async () => {
    const db = createFakeDb({
      // Displayed (a) is Copper Age under this map.
      nexus_test_attempts: [attempt('u1', { 'q-indus': 'a' })],
      nexus_test_draws: [draw('u1', { 'q-indus': INDUS_MAP })],
    });

    const [row] = await getQuestionAnalysis('t1', {}, db.client);

    expect(row.correct).toBe(0);
    expect(row.top_wrong_option).toEqual({ key: 'd', text: 'Copper Age civilization', count: 1 });
    expect(row.option_counts).toEqual({ d: 1 });
  });

  it('reads an undrawn sitting exactly as stored', async () => {
    const db = createFakeDb({
      // No draw row: the paper was served in bank order, so 'B' IS Bronze Age.
      nexus_test_attempts: [attempt('u1', { 'q-indus': 'B' })],
      nexus_test_draws: [],
    });

    const [row] = await getQuestionAnalysis('t1', {}, db.client);

    expect(row.correct).toBe(1);
    // Case folded onto the option's own id, so one option is one bar.
    expect(row.option_counts).toEqual({ b: 1 });
  });

  it('applies a draw only to the sitting it belongs to', async () => {
    const db = createFakeDb({
      // Second sitting, answered in bank order. The only draw is for the first.
      nexus_test_attempts: [attempt('u1', { 'q-indus': 'b' }, { attempt_number: 2 })],
      nexus_test_draws: [draw('u1', { 'q-indus': INDUS_MAP }, { attempt_number: 1 })],
    });

    const [row] = await getQuestionAnalysis('t1', {}, db.client);

    expect(row.correct).toBe(1);
  });

  it('would have reported the question as broken without the draw', async () => {
    // The same clicks with the draw rows missing reproduce the screen that
    // started this: nobody right, most picked Copper Age.
    const db = createFakeDb({
      nexus_test_attempts: ['u1', 'u2', 'u3', 'u4', 'u5'].map((u) => attempt(u, { 'q-indus': 'd' })),
      nexus_test_draws: [],
    });

    const [row] = await getQuestionAnalysis('t1', {}, db.client);

    expect(row.correct_pct).toBe(0);
    expect(row.top_wrong_option?.text).toBe('Copper Age civilization');
    expect(row.needs_review).toBe(true);
  });

  it('keeps no option bars for a question with no options', async () => {
    composed.current = [
      { question_id: 'q-num', question_text: 'Area?', question_format: 'NUMERICAL', options: null, correct_answer: '42', sort_order: 0, marks: 1 },
    ];
    const db = createFakeDb({
      nexus_test_attempts: [attempt('u1', { 'q-num': '42' })],
      nexus_test_draws: [],
    });

    const [row] = await getQuestionAnalysis('t1', {}, db.client);

    expect(row.correct).toBe(1);
    expect(row.option_counts).toBeNull();
  });
});

describe('a student\'s mistakes on a shuffled paper', () => {
  const other = {
    question_id: 'q-other',
    question_format: 'MCQ',
    options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    correct_answer: 'c',
  };
  const plain = { question_id: 'q-plain', question_format: 'MCQ', correct_answer: 'a' };

  function seed() {
    return createFakeDb({
      nexus_test_attempts: [
        // Drawn paper: 'd' is Bronze Age (right); 'a' on q-other is original 'b' (wrong).
        attempt('u1', { 'q-indus': 'd', 'q-other': 'a' }),
        // An undrawn paper on another test, answered correctly in bank order.
        attempt('u1', { 'q-plain': 'a' }, { test_id: 't2', submitted_at: '2026-08-19T10:00:00Z' }),
      ],
      nexus_test_draws: [draw('u1', { 'q-indus': INDUS_MAP, 'q-other': ['b', 'c', 'a', 'd'] })],
      nexus_qb_questions: [
        { id: 'q-indus', ...indus, is_active: true },
        { id: 'q-other', ...other, is_active: true },
        { id: 'q-plain', ...plain, is_active: true },
      ],
    });
  }

  it('never serves back a question the student answered correctly', async () => {
    const mistakes = await getStudentMistakeQuestionIds('u1', {}, seed().client);
    expect(mistakes).toEqual(['q-other']);
  });

  it('reports accuracy on what the student actually chose', async () => {
    const accuracy = await getStudentAccuracy('u1', seed().client);
    expect(accuracy).toEqual({ answered: 3, correct: 2, accuracy_pct: 67 });
  });
});
