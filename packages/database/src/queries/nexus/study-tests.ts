// @ts-nocheck — nexus_study_test* tables not yet in generated Supabase types;
// regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusStudyTest,
  NexusStudyTestQuestion,
  NexusStudyTestQuestionInput,
  NexusStudyTestForStudent,
  NexusStudyTestAttemptResult,
} from '../../types';

const TESTS = 'nexus_study_tests';
const QUESTIONS = 'nexus_study_test_questions';
const ATTEMPTS = 'nexus_study_test_attempts';

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

/** The file's test row (or null). */
export async function getTestByFileId(
  fileId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyTest | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from(TESTS as any).select('*').eq('file_id', fileId).maybeSingle();
  return (data as NexusStudyTest) || null;
}

/** Which of these file ids have a (published) test — for the "has test" card badge. */
export async function hasTestForFiles(
  fileIds: string[],
  client?: TypedSupabaseClient,
): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(TESTS as any)
    .select('file_id')
    .eq('is_published', true)
    .in('file_id', fileIds);
  return new Set((data || []).map((r: any) => r.file_id));
}

/** Full test + questions (with answers) for the teacher authoring/preview view. */
export async function getTestWithQuestionsForStaff(
  fileId: string,
  client?: TypedSupabaseClient,
): Promise<{ test: NexusStudyTest; questions: NexusStudyTestQuestion[] } | null> {
  const supabase = client || getSupabaseAdminClient();
  const test = await getTestByFileId(fileId, supabase);
  if (!test) return null;
  const { data } = await supabase
    .from(QUESTIONS as any)
    .select('*')
    .eq('test_id', test.id)
    .order('sort_order', { ascending: true });
  const questions = (data || []) as NexusStudyTestQuestion[];

  // Recover each question's bank id from the composed mirror placement (positional match by
  // sort_order) so re-saving a bank-sourced test re-links instead of duplicating in the bank.
  try {
    const { data: placement } = await supabase
      .from('nexus_test_placements')
      .select('test_id')
      .eq('context_type', 'study_file')
      .eq('context_id', fileId)
      .eq('is_active', true)
      .maybeSingle();
    if (placement?.test_id) {
      const { data: tqs } = await supabase
        .from('nexus_test_questions')
        .select('qb_question_id, sort_order')
        .eq('test_id', placement.test_id)
        .order('sort_order', { ascending: true });
      const bankIds = (tqs || []).map((r: any) => r.qb_question_id);
      if (bankIds.length === questions.length) {
        questions.forEach((q, i) => {
          (q as any).qb_question_id = bankIds[i] || null;
        });
      }
    }
  } catch {
    /* best-effort: linkage recovery is non-fatal */
  }

  return { test, questions };
}

/** Student-safe test payload (no answers/explanations). Null if no published test. */
export async function getTestForStudent(
  fileId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyTestForStudent | null> {
  const supabase = client || getSupabaseAdminClient();
  const test = await getTestByFileId(fileId, supabase);
  if (!test || !test.is_published) return null;
  const { data } = await supabase
    .from(QUESTIONS as any)
    .select('id, question_text, option_a, option_b, option_c, option_d, sort_order')
    .eq('test_id', test.id)
    .order('sort_order', { ascending: true });
  const questions = ((data || []) as any[]).map((q) => ({
    id: q.id,
    question_text: q.question_text,
    options: OPTION_KEYS.filter((k) => q[`option_${k}`] != null && q[`option_${k}`] !== '').map((k) => ({
      key: k,
      text: q[`option_${k}`] as string,
    })),
  }));
  return {
    id: test.id,
    file_id: test.file_id,
    title: test.title,
    passing_pct: test.passing_pct,
    questions,
  };
}

/**
 * Create or replace the file's test and its questions in one shot (delete + reinsert questions).
 * Returns the test id. Historical attempts are left untouched (they store their own scores).
 */
export async function upsertTestWithQuestions(
  input: {
    fileId: string;
    title?: string | null;
    passingPct: number;
    questions: NexusStudyTestQuestionInput[];
    createdBy: string;
  },
  client?: TypedSupabaseClient,
): Promise<{ id: string }> {
  const supabase = client || getSupabaseAdminClient();
  const passing = Math.max(1, Math.min(100, Math.round(input.passingPct || 70)));

  const existing = await getTestByFileId(input.fileId, supabase);
  let testId: string;
  if (existing) {
    testId = existing.id;
    await supabase
      .from(TESTS as any)
      .update({ title: input.title ?? null, passing_pct: passing, updated_at: new Date().toISOString() })
      .eq('id', testId);
    await supabase.from(QUESTIONS as any).delete().eq('test_id', testId);
  } else {
    const { data, error } = await supabase
      .from(TESTS as any)
      .insert({ file_id: input.fileId, title: input.title ?? null, passing_pct: passing, created_by: input.createdBy })
      .select('id')
      .single();
    if (error) throw error;
    testId = (data as any).id;
  }

  const rows = input.questions.map((q, i) => ({
    test_id: testId,
    question_text: q.question_text,
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c ?? null,
    option_d: q.option_d ?? null,
    correct_option: q.correct_option,
    explanation: q.explanation ?? null,
    sort_order: i,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from(QUESTIONS as any).insert(rows);
    if (error) throw error;
  }

  // Additive: mirror this study test into the central bank + unified engine so its
  // questions become reusable assets (available in the teacher builder, etc.).
  // Best-effort: never blocks the primary inline save that the student take flow uses.
  try {
    await mirrorStudyTestToBank(supabase, {
      fileId: input.fileId,
      title: input.title,
      passingPct: passing,
      questions: input.questions,
      createdBy: input.createdBy,
    });
  } catch (err) {
    console.error('[study-test] bank mirror failed (non-fatal):', err instanceof Error ? err.message : err);
  }

  return { id: testId };
}

/**
 * Mirror a study test into nexus_qb_questions + a composed, placed nexus_tests.
 * Replaces any prior composed test for the file, deleting bank questions that were
 * exclusively owned by it (questions reused by another test are kept).
 */
async function mirrorStudyTestToBank(
  supabase: any,
  input: {
    fileId: string;
    title?: string | null;
    passingPct: number;
    questions: NexusStudyTestQuestionInput[];
    createdBy: string;
  },
): Promise<void> {
  // 1. Remove any prior composed test for this file (cleans up exclusively-owned questions).
  await removeStudyBankMirror(supabase, input.fileId);

  if (input.questions.length === 0) return;
  await composeAndPlaceStudyBankTest(supabase, input);
}

/** Delete the composed/placed bank test for a study file + any exclusively-owned bank questions. */
async function removeStudyBankMirror(supabase: any, fileId: string): Promise<void> {
  const { data: priorPlacements } = await supabase
    .from('nexus_test_placements')
    .select('id, test_id, gating')
    .eq('context_type', 'study_file')
    .eq('context_id', fileId)
    .eq('is_active', true);

  for (const p of priorPlacements || []) {
    // Questions that were PICKED from the bank (not created by this mirror) are recorded on the
    // placement's gating so we never delete a borrowed/standalone bank question on re-save.
    const reused = new Set<string>(
      Array.isArray(p.gating?.reused_qb_ids) ? p.gating.reused_qb_ids.filter(Boolean) : [],
    );

    const { data: priorTqs } = await supabase
      .from('nexus_test_questions')
      .select('qb_question_id')
      .eq('test_id', p.test_id);
    const priorQids = (priorTqs || [])
      .map((r: any) => r.qb_question_id)
      .filter((id: string | null) => id && !reused.has(id));

    // Delete the composed test (cascades its nexus_test_questions + placement).
    await supabase.from('nexus_tests').delete().eq('id', p.test_id);

    // Remove only mirror-created bank questions that are now exclusively owned by nothing.
    for (const qid of priorQids) {
      const { count } = await supabase
        .from('nexus_test_questions')
        .select('test_id', { count: 'exact', head: true })
        .eq('qb_question_id', qid);
      if (!count || count === 0) {
        await supabase.from('nexus_qb_questions').delete().eq('id', qid);
      }
    }
  }
}

async function composeAndPlaceStudyBankTest(
  supabase: any,
  input: {
    fileId: string;
    title?: string | null;
    passingPct: number;
    questions: NexusStudyTestQuestionInput[];
    createdBy: string;
  },
): Promise<void> {
  // 2. Resolve each question to a bank id: reuse the picked one (qb_question_id) or create fresh.
  //    Reused questions are LINKED, not duplicated, so a tagged bank question can seed many chapters.
  const bankIds: (string | null)[] = new Array(input.questions.length).fill(null);
  const reusedQbIds: string[] = [];
  const toCreate: Array<{ idx: number; row: Record<string, unknown> }> = [];

  input.questions.forEach((q, i) => {
    if (q.qb_question_id) {
      bankIds[i] = q.qb_question_id;
      reusedQbIds.push(q.qb_question_id);
      return;
    }
    toCreate.push({
      idx: i,
      row: {
        question_text: q.question_text,
        question_format: 'MCQ',
        options: OPTION_KEYS
          .filter((k) => (q as any)[`option_${k}`] != null && (q as any)[`option_${k}`] !== '')
          .map((k) => ({ id: k, text: (q as any)[`option_${k}`] })),
        correct_answer: q.correct_option,
        explanation_brief: q.explanation || 'From a study-material test',
        difficulty: 'MEDIUM',
        exam_relevance: 'NATA',
        categories: [],
        status: 'active',
        origin: 'authored',
        answer_source: 'teacher_verified',
        is_active: true,
        created_by: input.createdBy,
      },
    });
  });

  if (toCreate.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from('nexus_qb_questions')
      .insert(toCreate.map((t) => t.row))
      .select('id');
    if (insErr) throw insErr;
    const newIds = (inserted || []).map((r: any) => r.id);
    if (newIds.length !== toCreate.length) return; // safety: partial insert
    toCreate.forEach((t, j) => {
      bankIds[t.idx] = newIds[j];
    });
  }
  if (bankIds.some((id) => !id)) return; // safety: some question failed to resolve

  // 3. Compose a repository test + place onto the study file.
  const { data: test, error: testErr } = await supabase
    .from('nexus_tests')
    .insert({
      title: input.title || 'Chapter test',
      test_type: 'untimed',
      total_marks: bankIds.length,
      is_published: true,
      is_active: true,
      is_repository: true,
      created_from: 'study_authored',
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (testErr) throw testErr;

  const tqRows = bankIds.map((id: string, i: number) => ({
    test_id: test.id,
    qb_question_id: id,
    sort_order: i,
    marks: 1,
    negative_marks: 0,
  }));
  await supabase.from('nexus_test_questions').insert(tqRows);

  await supabase.from('nexus_test_placements').insert({
    test_id: test.id,
    context_type: 'study_file',
    context_id: input.fileId,
    passing_pct: input.passingPct,
    // Record which questions were picked from the bank so teardown never deletes a borrowed row.
    gating: reusedQbIds.length > 0 ? { reused_qb_ids: reusedQbIds } : {},
    created_by: input.createdBy,
  });
}

/** Remove the file's test (cascades to questions + attempts). */
export async function deleteTestForFile(
  fileId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  await supabase.from(TESTS as any).delete().eq('file_id', fileId);
  // Also tear down the bank mirror (composed test + placement + exclusively-owned questions).
  try {
    await removeStudyBankMirror(supabase, fileId);
  } catch (err) {
    console.error('[study-test] bank mirror teardown failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/**
 * Grade a submitted attempt (answers = { [questionId]: 'a'|'b'|'c'|'d' }), record it, and mark the
 * file completed for the student if they passed. Returns the score + per-question review.
 */
export async function gradeAndRecordAttempt(
  fileId: string,
  studentId: string,
  answers: Record<string, string>,
  client?: TypedSupabaseClient,
): Promise<NexusStudyTestAttemptResult> {
  const supabase = client || getSupabaseAdminClient();
  const withQ = await getTestWithQuestionsForStaff(fileId, supabase);
  if (!withQ || withQ.questions.length === 0) throw new Error('No test to submit');
  const { test, questions } = withQ;

  let correct = 0;
  const review = questions.map((q) => {
    const selected = answers?.[q.id] ?? null;
    const isCorrect = selected === q.correct_option;
    if (isCorrect) correct += 1;
    return {
      question_id: q.id,
      correct_option: q.correct_option,
      selected,
      is_correct: isCorrect,
      explanation: q.explanation,
    };
  });

  const total = questions.length;
  const scorePct = Math.round((correct / total) * 10000) / 100; // 2 dp
  const passed = scorePct >= test.passing_pct;

  // Attempt number = prior attempts + 1.
  const { count } = await supabase
    .from(ATTEMPTS as any)
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('file_id', fileId);
  const attemptNumber = (count || 0) + 1;

  const { data: inserted, error } = await supabase
    .from(ATTEMPTS as any)
    .insert({
      test_id: test.id,
      file_id: fileId,
      student_id: studentId,
      answers: answers || {},
      correct_count: correct,
      total_count: total,
      score_pct: scorePct,
      passed,
      attempt_number: attemptNumber,
    })
    .select('id')
    .single();
  if (error) throw error;
  const attemptId = (inserted as any).id;

  if (passed) {
    await supabase.rpc('nexus_study_mark_completed', {
      p_user: studentId,
      p_file: fileId,
      p_score: scorePct,
      p_attempt: attemptId,
    });
  }

  return {
    attempt_id: attemptId,
    correct_count: correct,
    total_count: total,
    score_pct: scorePct,
    passed,
    passing_pct: test.passing_pct,
    completed: passed,
    review,
  };
}
