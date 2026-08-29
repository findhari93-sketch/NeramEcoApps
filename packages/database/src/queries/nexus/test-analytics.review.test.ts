import { describe, expect, it, vi } from 'vitest';

/**
 * The teacher's response sheet, and the working feature it was carved out of.
 *
 * getStudentTestAttemptReview is a generalisation of getStudyFileAttemptReview:
 * everything that one did after resolving which paper a chapter holds was
 * already test agnostic. The risk in that move is silent, because a chapter
 * report that starts returning slightly different JSON still renders. So the
 * last test here is a golden one: same inputs, byte-identical output.
 */

const composed = [
  {
    question_id: 'q1',
    question_text: 'Who began the Qutub Minar?',
    question_format: 'MCQ',
    options: [
      { id: 'a', text: 'Qutb al-Din Aibak' },
      { id: 'b', text: 'Iltutmish' },
    ],
    correct_answer: 'a',
    explanation_brief: 'Aibak began it in 1199.',
    explanation_detailed: null,
    sort_order: 0,
  },
  {
    question_id: 'q2',
    question_text: 'Which dynasty completed it?',
    question_format: 'MCQ',
    options: [
      { id: 'a', text: 'Tughlaq' },
      { id: 'b', text: 'Slave' },
    ],
    correct_answer: 'b',
    explanation_brief: null,
    explanation_detailed: 'Iltutmish added three storeys.',
    sort_order: 1,
  },
];

vi.mock('./test-repository', () => ({
  composeTest: vi.fn(),
  getComposedTestQuestions: vi.fn(async () => composed),
  // The real grader, reduced to the part these tests depend on: which answers
  // were right. Replaying against the served draw is what stops a review
  // disagreeing with what the student was shown, so the shape is preserved.
  gradeAgainstDraw: (questions: any[], _draw: any, answers: Record<string, string>) => ({
    questions,
    review: questions.map((q) => ({
      question_id: q.question_id,
      correct_answer: q.correct_answer,
      selected: answers[q.question_id] ?? null,
      is_correct: answers[q.question_id] === q.correct_answer,
      is_gradable: true,
    })),
  }),
}));

vi.mock('./question-bank', () => ({ gradeQBAnswerStrict: vi.fn() }));

const { getStudentTestAttemptReview } = await import('./test-analytics');

const ATTEMPTS = [
  {
    id: 'att-1',
    attempt_number: 1,
    mode: 'official',
    status: 'submitted',
    placement_id: 'p-1',
    answers: { q1: 'b', q2: 'b' },
    score: 1,
    total_marks: 2,
    percentage: 50,
    started_at: '2026-08-07T03:00:00Z',
    submitted_at: '2026-08-07T04:00:00Z',
    time_spent_seconds: 600,
  },
  {
    id: 'att-2',
    attempt_number: 2,
    mode: 'official',
    status: 'submitted',
    placement_id: 'p-1',
    answers: { q1: 'a', q2: 'b' },
    score: 2,
    total_marks: 2,
    percentage: 100,
    started_at: '2026-08-09T03:00:00Z',
    submitted_at: '2026-08-09T04:00:00Z',
    time_spent_seconds: 400,
  },
];

function stubClient(seed: Record<string, any[]>, spy?: { draws: number }) {
  return {
    from(table: string) {
      if (table === 'nexus_test_draws' && spy) spy.draws += 1;
      const result = (single: boolean) => {
        const rows = seed[table] || [];
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null });
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        order: () => chain,
        maybeSingle: () => result(true),
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => result(false).then(ok, no),
      };
      return chain;
    },
  } as never;
}

const seed = () => ({
  nexus_test_attempts: ATTEMPTS,
  nexus_tests: [{ id: 't-1', title: 'History of Architecture', passing_marks: 1, total_marks: 2 }],
  nexus_test_draws: [],
  drawing_submissions: [],
});

describe('getStudentTestAttemptReview', () => {
  it('replays every attempt separately rather than collapsing them into a best score', async () => {
    const { attempts } = await getStudentTestAttemptReview(
      { testId: 't-1', studentId: 'stu-1' },
      stubClient(seed()),
    );

    expect(attempts).toHaveLength(2);
    expect(attempts[0].attempt_number).toBe(1);
    expect(attempts[0].percentage).toBe(50);
    expect(attempts[1].attempt_number).toBe(2);
    expect(attempts[1].percentage).toBe(100);
  });

  /**
   * The founder asked to see "the response sheet of the students and their
   * individual attempts". This is that: what they picked, what was right, and
   * why, for one sitting.
   */
  it('shows what the student picked and what was right, per question, per attempt', async () => {
    const { attempts } = await getStudentTestAttemptReview(
      { testId: 't-1', studentId: 'stu-1' },
      stubClient(seed()),
    );

    const first = attempts[0].review;
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      question_id: 'q1',
      question_text: 'Who began the Qutub Minar?',
      selected: 'b',
      correct_answer: 'a',
      is_correct: false,
      explanation: 'Aibak began it in 1199.',
    });
    // The same question, answered correctly the second time round.
    expect(attempts[1].review[0]).toMatchObject({ selected: 'a', is_correct: true });
  });

  /**
   * The original fired one draw lookup per attempt inside a Promise.all, so a
   * student with seven retakes cost seven round trips to open one drawer.
   */
  it('reads the draws for every attempt in one query, not one per attempt', async () => {
    const spy = { draws: 0 };
    await getStudentTestAttemptReview({ testId: 't-1', studentId: 'stu-1' }, stubClient(seed(), spy));
    expect(spy.draws).toBe(1);
  });

  it('judges each attempt against the bar passed in, over the test default', async () => {
    const { attempts } = await getStudentTestAttemptReview(
      { testId: 't-1', studentId: 'stu-1', passingPct: 80 },
      stubClient(seed()),
    );

    // 50% fails an 80% bar; the test's own 1/2 bar would have passed it.
    expect(attempts[0].passed).toBe(false);
    expect(attempts[1].passed).toBe(true);
  });

  it('has nothing to replay for a student who never sat it', async () => {
    const empty = { ...seed(), nexus_test_attempts: [] };
    const { test, attempts } = await getStudentTestAttemptReview(
      { testId: 't-1', studentId: 'stu-1' },
      stubClient(empty),
    );

    expect(attempts).toEqual([]);
    // Still names the paper, so the drawer can say "no attempts yet" rather
    // than reading as an error.
    expect(test?.title).toBe('History of Architecture');
  });
});

/**
 * THE GOLDEN TEST. getStudyFileAttemptReview now delegates here, and its route
 * and its drawer were not changed. If this shape ever drifts, a working feature
 * breaks quietly somewhere nobody is looking.
 */
describe('the study file report shape survives the move', () => {
  it('still publishes exactly the keys the chapter report and its drawer read', async () => {
    const { attempts } = await getStudentTestAttemptReview(
      { testId: 't-1', studentId: 'stu-1', passingPct: 50 },
      stubClient(seed()),
    );

    const asStudyFileAttempt = {
      attempt_id: attempts[0].attempt_id,
      attempt_number: attempts[0].attempt_number,
      mode: attempts[0].mode,
      submitted_at: attempts[0].submitted_at,
      score: attempts[0].score,
      total_marks: attempts[0].total_marks,
      percentage: attempts[0].percentage,
      passed: attempts[0].passed,
      review: attempts[0].review,
    };

    expect(asStudyFileAttempt).toEqual({
      attempt_id: 'att-1',
      attempt_number: 1,
      mode: 'official',
      submitted_at: '2026-08-07T04:00:00Z',
      score: 1,
      total_marks: 2,
      percentage: 50,
      passed: true,
      review: [
        {
          question_id: 'q1',
          question_text: 'Who began the Qutub Minar?',
          options: [
            { id: 'a', text: 'Qutb al-Din Aibak' },
            { id: 'b', text: 'Iltutmish' },
          ],
          correct_answer: 'a',
          selected: 'b',
          is_correct: false,
          is_gradable: true,
          explanation: 'Aibak began it in 1199.',
          explanation_detailed: null,
        },
        {
          question_id: 'q2',
          question_text: 'Which dynasty completed it?',
          options: [
            { id: 'a', text: 'Tughlaq' },
            { id: 'b', text: 'Slave' },
          ],
          correct_answer: 'b',
          selected: 'b',
          is_correct: true,
          is_gradable: true,
          explanation: null,
          explanation_detailed: 'Iltutmish added three storeys.',
        },
      ],
    });
  });
});
