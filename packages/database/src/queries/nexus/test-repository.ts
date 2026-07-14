// @ts-nocheck — nexus_test_placements + nexus_tests.is_repository/created_from are not
// yet in the generated Supabase types. Regenerate after 20260713190000 is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusPlacementContext,
  NexusTestPlacement,
  NexusComposedQuestion,
  NexusTestGradeResult,
} from '../../types';

const TESTS = 'nexus_tests';
const TEST_QUESTIONS = 'nexus_test_questions';
const ATTEMPTS = 'nexus_test_attempts';
const PLACEMENTS = 'nexus_test_placements';

export type TimerType = 'none' | 'full' | 'per_question';

function testTypeFromTimer(timer: TimerType | undefined): string {
  switch (timer) {
    case 'full':
      return 'timed';
    case 'per_question':
      return 'per_question_timer';
    default:
      return 'untimed';
  }
}

export interface ComposeTestInput {
  title: string;
  description?: string | null;
  questionIds: string[];
  /** Per-question marks (aligned with questionIds) or a single value for all. Defaults to 1. */
  marks?: number[] | number;
  timerType?: TimerType;
  durationMinutes?: number | null;
  perQuestionSeconds?: number | null;
  passingMarks?: number | null;
  shuffle?: boolean;
  isPublished?: boolean;
  isRepository?: boolean;
  createdFrom?: string | null;
  createdBy?: string | null;
  createdByStudent?: string | null;
  classroomId?: string | null;
}

/**
 * Create a test as a composition of bank questions (references, not copies).
 * Shared by the student custom-test builder and the teacher repository builder.
 */
export async function composeTest(
  input: ComposeTestInput,
  client?: TypedSupabaseClient,
): Promise<{ id: string }> {
  const supabase = client || getSupabaseAdminClient();
  const ids = [...new Set(input.questionIds)];
  if (ids.length === 0) throw new Error('A test needs at least one question');

  // Validate all questions exist and are active in the bank.
  const { data: existing, error: qErr } = await supabase
    .from('nexus_qb_questions')
    .select('id')
    .in('id', ids)
    .eq('is_active', true);
  if (qErr) throw qErr;
  const valid = new Set((existing || []).map((q: any) => q.id));
  const invalid = ids.filter((id) => !valid.has(id));
  if (invalid.length > 0) throw new Error(`Invalid or inactive question ids: ${invalid.join(', ')}`);

  const marksFor = (i: number): number => {
    if (Array.isArray(input.marks)) return Number(input.marks[i]) || 1;
    if (typeof input.marks === 'number') return input.marks;
    return 1;
  };
  const totalMarks = ids.reduce((sum, _id, i) => sum + marksFor(i), 0);

  const { data: test, error: testErr } = await supabase
    .from(TESTS)
    .insert({
      classroom_id: input.classroomId ?? null,
      title: input.title.trim(),
      description: input.description ?? null,
      test_type: testTypeFromTimer(input.timerType),
      duration_minutes: input.timerType === 'full' ? input.durationMinutes ?? null : null,
      per_question_seconds: input.timerType === 'per_question' ? input.perQuestionSeconds ?? null : null,
      total_marks: totalMarks,
      passing_marks: input.passingMarks ?? null,
      is_published: input.isPublished ?? true,
      is_active: true,
      is_repository: input.isRepository ?? false,
      created_from: input.createdFrom ?? null,
      shuffle_questions: input.shuffle ?? false,
      is_custom: !input.isRepository,
      created_by: input.createdBy ?? null,
      created_by_student: input.createdByStudent ?? null,
    })
    .select('id')
    .single();
  if (testErr) throw testErr;

  const rows = ids.map((qId, i) => ({
    test_id: test.id,
    qb_question_id: qId,
    sort_order: i,
    marks: marksFor(i),
    negative_marks: 0,
  }));
  const { error: tqErr } = await supabase.from(TEST_QUESTIONS).insert(rows);
  if (tqErr) throw tqErr;

  return { id: test.id };
}

/** List repository tests (optionally by author), newest first. */
export async function listRepositoryTests(
  opts?: { createdBy?: string },
  client?: TypedSupabaseClient,
): Promise<any[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(TESTS)
    .select('id, title, description, test_type, total_marks, passing_marks, is_published, created_from, created_at')
    .eq('is_repository', true)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (opts?.createdBy) query = query.eq('created_by', opts.createdBy);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Load a test's questions resolving both bank (qb_question_id) and legacy
 * verified (question_id) references. withAnswers=true includes the correct answer.
 */
export async function getComposedTestQuestions(
  testId: string,
  withAnswers: boolean,
  client?: TypedSupabaseClient,
): Promise<Array<NexusComposedQuestion & { correct_answer?: string | null }>> {
  const supabase = client || getSupabaseAdminClient();
  const { data: tqs, error } = await supabase
    .from(TEST_QUESTIONS)
    .select('id, qb_question_id, question_id, marks, sort_order')
    .eq('test_id', testId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const list = tqs || [];
  if (list.length === 0) return [];

  const qbIds = list.filter((t: any) => t.qb_question_id).map((t: any) => t.qb_question_id);
  const vIds = list.filter((t: any) => !t.qb_question_id && t.question_id).map((t: any) => t.question_id);

  const qbMap = new Map<string, any>();
  if (qbIds.length > 0) {
    const { data } = await supabase
      .from('nexus_qb_questions')
      .select('id, question_text, question_image_url, question_format, options, correct_answer')
      .in('id', qbIds);
    for (const q of data || []) qbMap.set(q.id, q);
  }
  const vMap = new Map<string, any>();
  if (vIds.length > 0) {
    const { data } = await supabase
      .from('nexus_verified_questions')
      .select('id, question_text, question_image_url, question_type, options, correct_answer')
      .in('id', vIds);
    for (const q of data || []) vMap.set(q.id, q);
  }

  return list.map((tq: any) => {
    const src = tq.qb_question_id ? qbMap.get(tq.qb_question_id) : vMap.get(tq.question_id);
    const questionId = tq.qb_question_id || tq.question_id;
    const out: any = {
      test_question_id: tq.id,
      question_id: questionId,
      question_text: src?.question_text ?? null,
      question_image_url: src?.question_image_url ?? null,
      question_format: src?.question_format || src?.question_type || 'MCQ',
      options: src?.options ?? null,
      marks: Number(tq.marks) || 1,
      sort_order: tq.sort_order ?? 0,
    };
    if (withAnswers) out.correct_answer = src?.correct_answer ?? null;
    return out;
  });
}

/** Test metadata (student-safe fields). */
export async function getTestMeta(testId: string, client?: TypedSupabaseClient): Promise<any | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(TESTS)
    .select('id, title, description, test_type, duration_minutes, per_question_seconds, total_marks, passing_marks, is_published, is_active, shuffle_questions, is_repository')
    .eq('id', testId)
    .maybeSingle();
  return data || null;
}

// ============================================
// PLACEMENTS
// ============================================

export interface CreatePlacementInput {
  testId: string;
  contextType: NexusPlacementContext;
  contextId: string;
  passingPct?: number | null;
  minQuestionsToPass?: number | null;
  sortOrder?: number;
  isVisible?: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
  gating?: Record<string, unknown>;
  createdBy?: string | null;
}

export async function createPlacement(
  input: CreatePlacementInput,
  client?: TypedSupabaseClient,
): Promise<NexusTestPlacement> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLACEMENTS)
    .insert({
      test_id: input.testId,
      context_type: input.contextType,
      context_id: input.contextId,
      passing_pct: input.passingPct ?? null,
      min_questions_to_pass: input.minQuestionsToPass ?? null,
      sort_order: input.sortOrder ?? 0,
      is_visible: input.isVisible ?? true,
      available_from: input.availableFrom ?? null,
      available_until: input.availableUntil ?? null,
      gating: input.gating ?? {},
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusTestPlacement;
}

/** Resolve the active placement(s) for a context. Single-test contexts return at most one. */
export async function getPlacementsByContext(
  contextType: NexusPlacementContext,
  contextId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestPlacement[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLACEMENTS)
    .select('*')
    .eq('context_type', contextType)
    .eq('context_id', contextId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusTestPlacement[];
}

export async function getPlacementById(
  placementId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestPlacement | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from(PLACEMENTS).select('*').eq('id', placementId).maybeSingle();
  return (data as NexusTestPlacement) || null;
}

export async function listPlacementsForTest(
  testId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestPlacement[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLACEMENTS)
    .select('*')
    .eq('test_id', testId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NexusTestPlacement[];
}

export async function deletePlacement(placementId: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  // Soft-delete so the single-test partial-unique index frees up and history is kept.
  const { error } = await supabase.from(PLACEMENTS).update({ is_active: false }).eq('id', placementId);
  if (error) throw error;
}

// ============================================
// UNIFIED ONE-SHOT GRADER
// ============================================

/**
 * Grade a submitted attempt for any placed/repository test in one shot:
 * grades against the bank, records a nexus_test_attempts row, and dispatches
 * the placement's context side-effect (study completion, recap gating, ...).
 * `answers` is keyed by the underlying question id.
 */
export async function gradeTestOneShot(
  input: {
    testId: string;
    studentId: string;
    answers: Record<string, string>;
    placementId?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusTestGradeResult> {
  const supabase = client || getSupabaseAdminClient();

  const [meta, questions, placement] = await Promise.all([
    getTestMeta(input.testId, supabase),
    getComposedTestQuestions(input.testId, true, supabase),
    input.placementId ? getPlacementById(input.placementId, supabase) : Promise.resolve(null),
  ]);
  if (!meta) throw new Error('Test not found');
  if (questions.length === 0) throw new Error('Test has no questions');

  let score = 0;
  let totalMarks = 0;
  const review = questions.map((q) => {
    const marks = Number(q.marks) || 1;
    totalMarks += marks;
    const selected = input.answers?.[q.question_id] ?? null;
    const isCorrect = selected != null && q.correct_answer != null && selected === q.correct_answer;
    const awarded = isCorrect ? marks : 0;
    if (isCorrect) score += marks;
    return {
      question_id: q.question_id,
      correct_answer: q.correct_answer ?? null,
      selected,
      is_correct: isCorrect,
      marks_awarded: awarded,
    };
  });

  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0;

  // Resolve pass threshold: placement.passing_pct wins, else derive from test.passing_marks.
  let passingPct: number | null = null;
  if (placement?.passing_pct != null) {
    passingPct = placement.passing_pct;
  } else if (meta.passing_marks != null && totalMarks > 0) {
    passingPct = Math.round((Number(meta.passing_marks) / totalMarks) * 100);
  }
  const passed = passingPct == null ? true : percentage >= passingPct;

  const { data: attempt, error } = await supabase
    .from(ATTEMPTS)
    .insert({
      test_id: input.testId,
      student_id: input.studentId,
      answers: input.answers || {},
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      score,
      total_marks: totalMarks,
      percentage: Math.max(0, percentage),
    })
    .select('id')
    .single();
  if (error) throw error;

  // Dispatch the context side-effect keyed by the placement's context.
  // student_practice + classroom_assignment have none. Recap/foundation/module land in Phases 5-6.
  if (placement && passed) {
    if (placement.context_type === 'study_file') {
      // Re-fire the EXISTING study-material completion (best-score upsert on nexus_study_file_reads).
      // best_attempt_id has no FK, so a nexus_test_attempts id is accepted.
      await supabase.rpc('nexus_study_mark_completed', {
        p_user: input.studentId,
        p_file: placement.context_id,
        p_score: Math.max(0, percentage),
        p_attempt: attempt.id,
      });
    }
  }

  return {
    attempt_id: attempt.id,
    score,
    total_marks: totalMarks,
    percentage: Math.max(0, percentage),
    passed,
    passing_pct: passingPct,
    review,
  };
}
