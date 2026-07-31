// @vitest-environment node
/**
 * Integration check for the unified test engine against a real Supabase project.
 *
 * Proves the things Phase 2 claims: one grading core, an attempt lifecycle that
 * resumes, unlimited retakes with rising attempt numbers, and analytics that
 * agree with the scores. Everything it creates it deletes.
 *
 *   set -a; . apps/nexus/.env.local; set +a
 *   INTEGRATION_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
 *   INTEGRATION_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *   RUN_DB_INTEGRATION=1 npx vitest run apps/nexus/src/lib/__integration__
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENABLED =
  process.env.RUN_DB_INTEGRATION === '1' &&
  Boolean(process.env.INTEGRATION_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (ENABLED) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.INTEGRATION_SUPABASE_URL as string;
  if (process.env.INTEGRATION_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.INTEGRATION_SUPABASE_ANON_KEY;
  }
}

const PREFIX = 'ZZ_ENGINE_';
const suite = ENABLED ? describe : describe.skip;

suite('unified test engine', () => {
  const created = { testIds: [] as string[], questionIds: [] as string[] };
  let studentId = '';
  let testId = '';
  let qCorrect = '';
  let qWrong = '';

  beforeAll(async () => {
    const { createQBQuestion, composeTest, getSupabaseAdminClient } = await import('@neram/database');
    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase.from('users').select('id').limit(1).single();
    studentId = user.id;

    const mk = async (text: string, answer: string) => {
      const q = await createQBQuestion({
        question_text: `${PREFIX}${text}`,
        question_format: 'MCQ',
        options: [
          { id: 'a', text: 'Alpha' },
          { id: 'b', text: 'Beta' },
        ],
        correct_answer: answer,
        explanation_brief: `Because ${answer} is right.`,
        difficulty: 'MEDIUM',
        exam_relevance: 'NATA',
        categories: [],
        status: 'active',
      });
      created.questionIds.push(q.id);
      return q.id;
    };
    qCorrect = await mk('question one', 'a');
    qWrong = await mk('question two', 'b');

    const composed = await composeTest({
      title: `${PREFIX}Engine probe`,
      questionIds: [qCorrect, qWrong],
      testKind: 'classroom_assigned',
      isRepository: true,
      isPublished: true,
    });
    testId = composed.id;
    created.testIds.push(testId);
  }, 60000);

  afterAll(async () => {
    if (!ENABLED) return;
    const { getSupabaseAdminClient } = await import('@neram/database');
    const supabase = getSupabaseAdminClient() as any;
    if (created.testIds.length) {
      await supabase.from('nexus_test_attempts').delete().in('test_id', created.testIds);
      await supabase.from('nexus_tests').delete().in('id', created.testIds);
    }
    if (created.questionIds.length) {
      await supabase.from('nexus_qb_questions').delete().in('id', created.questionIds);
    }
  });

  it('resumes an open attempt rather than opening a second one', async () => {
    const { startOrResumeAttempt } = await import('@neram/database');
    const first = await startOrResumeAttempt({ testId, studentId });
    expect(first.resumed).toBe(false);

    const second = await startOrResumeAttempt({ testId, studentId });
    expect(second.resumed).toBe(true);
    expect(second.attempt.id).toBe(first.attempt.id);
  }, 60000);

  it('grades with the shared core and allows unlimited retakes', async () => {
    const { startOrResumeAttempt, submitAttempt } = await import('@neram/database');

    // Attempt 1: half right.
    const a1 = await startOrResumeAttempt({ testId, studentId });
    const r1 = await submitAttempt({
      attemptId: a1.attempt.id,
      studentId,
      answers: { [qCorrect]: 'a', [qWrong]: 'a' },
    });
    expect(r1.score).toBe(1);
    expect(r1.total_marks).toBe(2);
    expect(r1.percentage).toBe(50);
    expect(r1.review.find((r) => r.question_id === qWrong)?.is_correct).toBe(false);

    // The old engine 409'd here, which is what made unlimited attempts impossible.
    const a2 = await startOrResumeAttempt({ testId, studentId });
    expect(a2.resumed).toBe(false);
    expect(a2.attempt.attempt_number).toBeGreaterThan(a1.attempt.attempt_number);
    expect(a2.previous_attempts).toBeGreaterThanOrEqual(1);

    const r2 = await submitAttempt({
      attemptId: a2.attempt.id,
      studentId,
      answers: { [qCorrect]: 'a', [qWrong]: 'b' },
    });
    expect(r2.percentage).toBe(100);
    expect(r2.attempt_id).not.toBe(r1.attempt_id);

    // Submitting the same attempt twice is refused, which is different from
    // refusing a second attempt.
    await expect(submitAttempt({ attemptId: a2.attempt.id, studentId, answers: {} })).rejects.toThrow(
      /ATTEMPT_ALREADY_SUBMITTED/,
    );
  }, 60000);

  it('reports results and per-question analysis that agree with the scores', async () => {
    const { getTestResults, getQuestionAnalysis } = await import('@neram/database');

    const results = await getTestResults(testId);
    const row = results.rows.find((r) => r.student_id === studentId);
    expect(row).toBeDefined();
    expect(row!.attempts).toBe(2);
    expect(row!.best_percentage).toBe(100);

    const analysis = await getQuestionAnalysis(testId);
    const wrongOne = analysis.find((q) => q.question_id === qWrong);
    expect(wrongOne).toBeDefined();
    // Answered twice, right once.
    expect(wrongOne!.answered).toBe(2);
    expect(wrongOne!.correct).toBe(1);
    expect(wrongOne!.correct_pct).toBe(50);
    // Fewer than 5 answers, so it must not be accused of being broken yet.
    expect(wrongOne!.needs_review).toBe(false);
  }, 60000);

  it('treats a question answered correctly later as no longer a mistake', async () => {
    const { getStudentMistakeQuestionIds } = await import('@neram/database');
    const mistakes = await getStudentMistakeQuestionIds(studentId, { limit: 50 });
    // qWrong was wrong on attempt 1 and right on attempt 2, so the latest answer wins.
    expect(mistakes).not.toContain(qWrong);
    expect(mistakes).not.toContain(qCorrect);
  }, 60000);

  it('duplicates a test without carrying its attempts or its placement', async () => {
    const { duplicateTest, getComposedTestQuestions, getSupabaseAdminClient } = await import('@neram/database');
    const copy = await duplicateTest(testId, null);
    created.testIds.push(copy.id);

    const supabase = getSupabaseAdminClient() as any;
    const { data: row } = await supabase
      .from('nexus_tests')
      .select('is_published, created_from')
      .eq('id', copy.id)
      .single();
    // Unpublished on purpose: nothing switches over until the teacher says so.
    expect(row.is_published).toBe(false);
    expect(row.created_from).toContain('duplicate_of:');

    const questions = await getComposedTestQuestions(copy.id, false);
    expect(questions).toHaveLength(2);

    const { count } = await supabase
      .from('nexus_test_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('test_id', copy.id);
    expect(count || 0).toBe(0);
  }, 60000);
});
