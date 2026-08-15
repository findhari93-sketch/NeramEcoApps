// @ts-nocheck: nexus_test_placements and nexus_tests.folder_id/test_kind are not
// in database.generated.ts yet. Regenerate once the migrations are on both envs.
/**
 * Reading back what happened in a test.
 *
 * Everything here works off nexus_test_attempts, which since the cutover holds
 * every attempt from every surface. That is what makes a single "my results"
 * view and a single per-question quality signal possible at all.
 *
 * Correctness is recomputed from the stored answers rather than persisted per
 * question. It costs one batched read of the bank and keeps a single definition
 * of "correct" (gradeQBAnswerStrict), so a grading fix retroactively corrects
 * the analytics instead of leaving them disagreeing with the score.
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { gradeQBAnswerStrict } from './question-bank';
import { composeTest, getComposedTestQuestions } from './test-repository';

const ATTEMPTS = 'nexus_test_attempts';
const TESTS = 'nexus_tests';
const TEST_QUESTIONS = 'nexus_test_questions';
const QUESTIONS = 'nexus_qb_questions';
const PLACEMENTS = 'nexus_test_placements';

/** The three buckets a performance view groups attempts into. */
export type NexusAttemptKind = 'practice' | 'class' | 'exam';

/**
 * Which bucket an attempt belongs in.
 *
 * "Exam" is not a test_kind, it is a placement context_type
 * (nexus_test_placements.context_type = 'exam'), so this can only be resolved
 * from the placement the attempt was taken through, never from the test row
 * alone. A null context (no placement, e.g. a student's own paper) is practice.
 */
function classifyAttemptKind(contextType: string | null | undefined): NexusAttemptKind {
  if (contextType === 'exam') return 'exam';
  if (contextType === 'classroom_assignment' || contextType === 'class_test') return 'class';
  return 'practice';
}

/** Batched placement_id -> context_type lookup, for classifying a page of attempts at once. */
async function getPlacementKindMap(
  placementIds: string[],
  supabase: TypedSupabaseClient,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(placementIds)].filter(Boolean);
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from(PLACEMENTS).select('id, context_type').in('id', ids);
  if (error) throw error;
  for (const row of (data || []) as any[]) map.set(row.id, row.context_type);
  return map;
}

export interface NexusStudentAttemptSummary {
  attempt_id: string;
  test_id: string;
  test_title: string;
  test_kind: string | null;
  kind: NexusAttemptKind;
  attempt_number: number;
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  passed: boolean | null;
  time_spent_seconds: number | null;
  submitted_at: string | null;
}

/** A student's own attempt history, newest first. */
export async function listStudentAttempts(
  studentId: string,
  opts?: { limit?: number; testId?: string },
  client?: TypedSupabaseClient,
): Promise<NexusStudentAttemptSummary[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(ATTEMPTS)
    .select('id, test_id, attempt_number, score, total_marks, percentage, time_spent_seconds, submitted_at, placement_id')
    .eq('student_id', studentId)
    .eq('status', 'submitted')
    // Practice runs on an already-completed chapter are not results. Without
    // this a parent would see a revision score reported as their child's mark.
    .eq('mode', 'official')
    .order('submitted_at', { ascending: false })
    // 200 was tuned for the recency lists (recent results, history page). The
    // performance dashboard's lifetime rollup needs a year's worth for a busy
    // student, so the ceiling goes up; the default stays 25 for every existing caller.
    .limit(Math.min(Math.max(opts?.limit ?? 25, 1), 500));
  if (opts?.testId) query = query.eq('test_id', opts.testId);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return [];

  const testIds = [...new Set(rows.map((r: any) => r.test_id))];
  const placementIds = rows.map((r: any) => r.placement_id).filter(Boolean);
  const [{ data: tests }, kindByPlacement] = await Promise.all([
    supabase.from(TESTS).select('id, title, test_kind, passing_marks, total_marks').in('id', testIds),
    getPlacementKindMap(placementIds, supabase),
  ]);
  const testMap = new Map((tests || []).map((t: any) => [t.id, t]));

  return rows.map((r: any) => {
    const test = testMap.get(r.test_id);
    // The bar is recovered from the test rather than stored on the attempt, so a
    // teacher lowering the pass mark does not leave old rows claiming a fail.
    const bar =
      test?.passing_marks != null && Number(r.total_marks) > 0
        ? (Number(test.passing_marks) / Number(test.total_marks || r.total_marks)) * 100
        : null;
    return {
      attempt_id: r.id,
      test_id: r.test_id,
      test_title: test?.title || 'Test',
      test_kind: test?.test_kind ?? null,
      kind: classifyAttemptKind(r.placement_id ? kindByPlacement.get(r.placement_id) : null),
      attempt_number: Number(r.attempt_number) || 1,
      score: r.score,
      total_marks: r.total_marks,
      percentage: r.percentage,
      passed: bar == null ? null : Number(r.percentage) >= bar,
      time_spent_seconds: r.time_spent_seconds,
      submitted_at: r.submitted_at,
    };
  });
}

/** Best percentage and attempt count per test for one student. */
export async function getStudentTestStats(
  studentId: string,
  testIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, { attempts: number; best_percentage: number | null; last_submitted_at: string | null }>> {
  const supabase = client || getSupabaseAdminClient();
  const out = new Map<string, { attempts: number; best_percentage: number | null; last_submitted_at: string | null }>();
  const ids = [...new Set(testIds)].filter(Boolean);
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from(ATTEMPTS)
    .select('test_id, percentage, submitted_at')
    .eq('student_id', studentId)
    .eq('status', 'submitted')
    // best_percentage must be the best OFFICIAL score, never a practice run.
    .eq('mode', 'official')
    .in('test_id', ids);
  if (error) throw error;

  for (const row of data || []) {
    const prev = out.get(row.test_id) || { attempts: 0, best_percentage: null, last_submitted_at: null };
    const pct = row.percentage == null ? null : Number(row.percentage);
    out.set(row.test_id, {
      attempts: prev.attempts + 1,
      best_percentage:
        pct == null ? prev.best_percentage : prev.best_percentage == null ? pct : Math.max(prev.best_percentage, pct),
      last_submitted_at:
        !prev.last_submitted_at || (row.submitted_at && row.submitted_at > prev.last_submitted_at)
          ? row.submitted_at
          : prev.last_submitted_at,
    });
  }
  return out;
}

interface AnsweredQuestion {
  question_id: string;
  selected: string | null;
  is_correct: boolean;
  answered_at: string | null;
}

/**
 * Every question this student has answered, with the verdict, latest answer
 * winning. Shared by the mistakes practice and the accuracy trend.
 */
async function collectAnsweredQuestions(
  studentId: string,
  opts: { limit?: number },
  supabase: TypedSupabaseClient,
): Promise<Map<string, AnsweredQuestion>> {
  const { data: attempts, error } = await supabase
    .from(ATTEMPTS)
    .select('answers, submitted_at')
    .eq('student_id', studentId)
    .eq('status', 'submitted')
    // Deliberately NOT filtered to official. This feeds "fix my mistakes", and a
    // question got wrong during revision is still a gap worth revisiting. Nothing
    // here is reported as a score, so a practice run cannot flatter or damage a
    // record; it only changes which questions come back.
    .order('submitted_at', { ascending: true })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));
  if (error) throw error;

  // Oldest first, so a later attempt on the same question simply overwrites the
  // earlier verdict and "wrong but since corrected" resolves itself.
  const latest = new Map<string, { selected: string | null; answered_at: string | null }>();
  for (const a of attempts || []) {
    const answers = (a.answers || {}) as Record<string, string>;
    for (const [questionId, selected] of Object.entries(answers)) {
      latest.set(questionId, { selected: selected ?? null, answered_at: a.submitted_at });
    }
  }
  if (latest.size === 0) return new Map();

  const ids = [...latest.keys()];
  const byId = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase
      .from(QUESTIONS)
      .select('id, correct_answer, question_format, answer_tolerance, is_active')
      .in('id', ids.slice(i, i + 500));
    for (const q of data || []) byId.set(q.id, q);
  }

  const out = new Map<string, AnsweredQuestion>();
  for (const [questionId, entry] of latest.entries()) {
    const q = byId.get(questionId);
    if (!q || !q.is_active) continue;
    const verdict = gradeQBAnswerStrict(q.question_format, entry.selected, q.correct_answer, q.answer_tolerance);
    // null means nothing can mark it, so it is neither a mistake nor a success.
    if (verdict === null) continue;
    out.set(questionId, {
      question_id: questionId,
      selected: entry.selected,
      is_correct: verdict === true,
      answered_at: entry.answered_at,
    });
  }
  return out;
}

/** Questions this student got wrong and has not since answered correctly. */
export async function getStudentMistakeQuestionIds(
  studentId: string,
  opts?: { limit?: number },
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const supabase = client || getSupabaseAdminClient();
  const answered = await collectAnsweredQuestions(studentId, { limit: 200 }, supabase);
  return [...answered.values()]
    .filter((a) => !a.is_correct)
    .sort((a, b) => String(b.answered_at || '').localeCompare(String(a.answered_at || '')))
    .slice(0, Math.min(Math.max(opts?.limit ?? 25, 1), 50))
    .map((a) => a.question_id);
}

/**
 * Compose a practice paper out of what this student keeps getting wrong.
 *
 * The single highest value thing a student can do with an attempt history, and
 * it is nearly free: the questions, the composer and the grader all exist. The
 * paper is regenerated each time, so it shrinks as they improve.
 */
export async function buildMistakesTest(
  input: { studentId: string; classroomId?: string | null; folderId?: string | null; limit?: number },
  client?: TypedSupabaseClient,
): Promise<{ test_id: string; question_count: number } | null> {
  const supabase = client || getSupabaseAdminClient();
  const questionIds = await getStudentMistakeQuestionIds(input.studentId, { limit: input.limit ?? 20 }, supabase);
  if (questionIds.length === 0) return null;

  const { id } = await composeTest(
    {
      title: `Fix my mistakes (${questionIds.length})`,
      questionIds,
      testKind: 'student_custom',
      isRepository: false,
      isPublished: true,
      createdFrom: 'mistakes',
      createdByStudent: input.studentId,
      classroomId: input.classroomId ?? null,
      folderId: input.folderId ?? null,
    },
    supabase,
  );
  return { test_id: id, question_count: questionIds.length };
}

/** A student's overall accuracy, for the progress page. */
export async function getStudentAccuracy(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{ answered: number; correct: number; accuracy_pct: number }> {
  const supabase = client || getSupabaseAdminClient();
  const answered = await collectAnsweredQuestions(studentId, { limit: 200 }, supabase);
  const total = answered.size;
  const correct = [...answered.values()].filter((a) => a.is_correct).length;
  return {
    answered: total,
    correct,
    accuracy_pct: total > 0 ? Math.round((correct / total) * 100) : 0,
  };
}

export interface NexusStudentPerformanceSummary {
  total_attempts: number;
  overall_average_pct: number | null;
  attempts_this_month: number;
  average_this_month: number | null;
  by_kind_totals: Record<NexusAttemptKind, number>;
  /** Newest month first. A month with zero attempts is simply absent, not a
   * zero-scored entry, so a trend chart can render it as a gap. */
  monthly: Array<{
    month: string;
    label: string;
    attempts: number;
    average_pct: number | null;
    by_kind: Record<NexusAttemptKind, number>;
  }>;
}

const emptyKindTotals = (): Record<NexusAttemptKind, number> => ({ practice: 0, class: 0, exam: 0 });

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/**
 * Lifetime rollup for the performance dashboard: how many tests, how well, and
 * whether that is trending. One raw fetch plus a JS reduce, the same shape as
 * getStudentTestStats above, rather than SQL aggregation, so "official
 * submitted attempts only" stays defined in exactly one place in this file.
 */
export async function getStudentPerformanceSummary(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudentPerformanceSummary> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ATTEMPTS)
    .select('placement_id, percentage, submitted_at')
    .eq('student_id', studentId)
    .eq('status', 'submitted')
    .eq('mode', 'official')
    .order('submitted_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data || []) as any[];

  const kindByPlacement = await getPlacementKindMap(
    rows.map((r) => r.placement_id).filter(Boolean),
    supabase,
  );

  const byKindTotals = emptyKindTotals();
  const monthly = new Map<
    string,
    { month: string; label: string; attempts: number; sumPct: number; scored: number; by_kind: Record<NexusAttemptKind, number> }
  >();

  const nowMonth = new Date().toISOString().slice(0, 7);
  let scoredCount = 0;
  let scoredSum = 0;
  let attemptsThisMonth = 0;
  let scoredThisMonth = 0;
  let sumThisMonth = 0;

  for (const r of rows) {
    const kind = classifyAttemptKind(r.placement_id ? kindByPlacement.get(r.placement_id) : null);
    byKindTotals[kind] += 1;

    const month: string = (r.submitted_at || '').slice(0, 7) || 'unknown';
    if (!monthly.has(month)) {
      monthly.set(month, {
        month,
        label: month === 'unknown' ? 'Unknown' : MONTH_LABEL_FORMATTER.format(new Date(`${month}-01T00:00:00Z`)),
        attempts: 0,
        sumPct: 0,
        scored: 0,
        by_kind: emptyKindTotals(),
      });
    }
    const bucket = monthly.get(month)!;
    bucket.attempts += 1;
    bucket.by_kind[kind] += 1;

    const pct = r.percentage == null ? null : Number(r.percentage);
    if (pct != null) {
      bucket.sumPct += pct;
      bucket.scored += 1;
      scoredSum += pct;
      scoredCount += 1;
      if (month === nowMonth) {
        sumThisMonth += pct;
        scoredThisMonth += 1;
      }
    }
    if (month === nowMonth) attemptsThisMonth += 1;
  }

  const monthlyList = [...monthly.values()]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((m) => ({
      month: m.month,
      label: m.label,
      attempts: m.attempts,
      average_pct: m.scored > 0 ? Math.round(m.sumPct / m.scored) : null,
      by_kind: m.by_kind,
    }));

  return {
    total_attempts: rows.length,
    overall_average_pct: scoredCount > 0 ? Math.round(scoredSum / scoredCount) : null,
    attempts_this_month: attemptsThisMonth,
    average_this_month: scoredThisMonth > 0 ? Math.round(sumThisMonth / scoredThisMonth) : null,
    by_kind_totals: byKindTotals,
    monthly: monthlyList,
  };
}

// ============================================
// TEACHER SIDE
// ============================================

export interface NexusTestResultRow {
  student_id: string;
  student_name: string | null;
  avatar_url: string | null;
  attempts: number;
  best_percentage: number | null;
  last_percentage: number | null;
  last_submitted_at: string | null;
  passed: boolean | null;
}

/**
 * Who has sat this test and how they did. Best score is what counts, because
 * retakes are unlimited, but the attempt count is shown next to it so effort
 * stays visible rather than being flattened into one number.
 */
export async function getTestResults(
  testId: string,
  client?: TypedSupabaseClient,
): Promise<{ rows: NexusTestResultRow[]; stats: { students: number; attempts: number; average: number | null; passed: number } }> {
  const supabase = client || getSupabaseAdminClient();

  const [{ data: attempts, error }, { data: test }] = await Promise.all([
    supabase
      .from(ATTEMPTS)
      .select('student_id, percentage, submitted_at, attempt_number')
      .eq('test_id', testId)
      .eq('status', 'submitted')
      // Cohort stats. A student practising after completion must not move the
      // class average or the pass rate.
      .eq('mode', 'official')
      .order('submitted_at', { ascending: true }),
    supabase.from(TESTS).select('passing_marks, total_marks').eq('id', testId).maybeSingle(),
  ]);
  if (error) throw error;

  const bar =
    test?.passing_marks != null && Number(test.total_marks) > 0
      ? (Number(test.passing_marks) / Number(test.total_marks)) * 100
      : null;

  const byStudent = new Map<string, NexusTestResultRow>();
  for (const a of attempts || []) {
    const pct = a.percentage == null ? null : Number(a.percentage);
    const row = byStudent.get(a.student_id) || {
      student_id: a.student_id,
      student_name: null,
      avatar_url: null,
      attempts: 0,
      best_percentage: null,
      last_percentage: null,
      last_submitted_at: null,
      passed: null,
    };
    row.attempts += 1;
    if (pct != null) {
      row.best_percentage = row.best_percentage == null ? pct : Math.max(row.best_percentage, pct);
      row.last_percentage = pct;
    }
    row.last_submitted_at = a.submitted_at;
    byStudent.set(a.student_id, row);
  }

  const rows = [...byStudent.values()];
  if (rows.length > 0) {
    // `name` is the display column on users; there is no full_name. Asking for
    // one makes PostgREST reject the whole request, and because this call used
    // to destructure `data` alone the rejection went nowhere: every row rendered
    // as "Unknown student" beside a perfectly correct score, which reads as a
    // class nobody has names for rather than as a broken query.
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .in('id', rows.map((r) => r.student_id));
    // Loud rather than degraded, matching the student-tests route. Whose score
    // this is happens to be the entire point of the results tab.
    if (userError) throw userError;

    const userMap = new Map((users || []).map((u: any) => [u.id, u]));
    for (const r of rows) {
      const u = userMap.get(r.student_id);
      r.student_name = u?.name ?? null;
      r.avatar_url = u?.avatar_url ?? null;
      r.passed = bar == null ? null : r.best_percentage != null && r.best_percentage >= bar;
    }
  }

  rows.sort((a, b) => (b.best_percentage ?? -1) - (a.best_percentage ?? -1));
  const scored = rows.filter((r) => r.best_percentage != null);
  return {
    rows,
    stats: {
      students: rows.length,
      attempts: (attempts || []).length,
      average: scored.length > 0 ? Math.round(scored.reduce((s, r) => s + (r.best_percentage || 0), 0) / scored.length) : null,
      passed: rows.filter((r) => r.passed).length,
    },
  };
}

export interface NexusQuestionAnalysisRow {
  question_id: string;
  question_text: string | null;
  sort_order: number;
  answered: number;
  correct: number;
  correct_pct: number | null;
  /** The wrong option most people picked, which is where the misconception is. */
  top_wrong_option: { key: string; text: string | null; count: number } | null;
  /** Under this, the question is more likely broken than hard. */
  needs_review: boolean;
}

/** How low a correct rate has to be before the question itself is the suspect. */
export const QUESTION_REVIEW_THRESHOLD_PCT = 20;

/**
 * Per question: how many got it right, and which wrong option pulled the most
 * people. This is the loop that keeps a growing bank trustworthy, because a
 * question everyone fails is usually ambiguous rather than difficult.
 */
export async function getQuestionAnalysis(
  testId: string,
  client?: TypedSupabaseClient,
): Promise<NexusQuestionAnalysisRow[]> {
  const supabase = client || getSupabaseAdminClient();

  const [questions, { data: attempts, error }] = await Promise.all([
    getComposedTestQuestions(testId, true, supabase),
    // Per-question difficulty for the teacher. Official attempts only, for the
    // same reason as the cohort stats above.
    supabase
      .from(ATTEMPTS)
      .select('answers')
      .eq('test_id', testId)
      .eq('status', 'submitted')
      .eq('mode', 'official'),
  ]);
  if (error) throw error;
  if (questions.length === 0) return [];

  return questions.map((q) => {
    let answered = 0;
    let correct = 0;
    const wrongCounts = new Map<string, number>();

    for (const a of attempts || []) {
      const selected = ((a.answers || {}) as Record<string, string>)[q.question_id];
      if (selected == null || selected === '') continue;
      const verdict = gradeQBAnswerStrict(q.question_format, selected, q.correct_answer, (q as any).answer_tolerance);
      if (verdict === null) continue;
      answered += 1;
      if (verdict) correct += 1;
      else wrongCounts.set(selected, (wrongCounts.get(selected) || 0) + 1);
    }

    let topWrong: NexusQuestionAnalysisRow['top_wrong_option'] = null;
    for (const [key, count] of wrongCounts.entries()) {
      if (!topWrong || count > topWrong.count) {
        const option = Array.isArray(q.options)
          ? (q.options as Array<{ id?: string; text?: string }>).find((o) => o?.id === key)
          : null;
        topWrong = { key, text: option?.text ?? null, count };
      }
    }

    const correctPct = answered > 0 ? Math.round((correct / answered) * 100) : null;
    return {
      question_id: q.question_id,
      question_text: q.question_text,
      sort_order: q.sort_order,
      answered,
      correct,
      correct_pct: correctPct,
      top_wrong_option: topWrong,
      // Needs a real sample before accusing a question of being broken.
      needs_review: answered >= 5 && correctPct != null && correctPct < QUESTION_REVIEW_THRESHOLD_PCT,
    };
  });
}

/**
 * Duplicate a test so an attempted paper can be revised without moving the
 * ground under scores students already earned. The copy starts unpublished and
 * unplaced, so nothing switches over until the teacher says so.
 */
export async function duplicateTest(
  testId: string,
  createdBy: string | null,
  client?: TypedSupabaseClient,
): Promise<{ id: string }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: test } = await supabase.from(TESTS).select('*').eq('id', testId).maybeSingle();
  if (!test) throw new Error('TEST_NOT_FOUND');

  const { data: rows } = await supabase
    .from(TEST_QUESTIONS)
    .select('qb_question_id, sort_order, marks')
    .eq('test_id', testId)
    .order('sort_order', { ascending: true });
  const questionIds = (rows || []).map((r: any) => r.qb_question_id).filter(Boolean);
  if (questionIds.length === 0) throw new Error('TEST_HAS_NO_QUESTIONS');

  return composeTest(
    {
      title: `${test.title} (v2)`,
      description: test.description,
      questionIds,
      marks: (rows || []).map((r: any) => Number(r.marks) || 1),
      testKind: test.test_kind || 'classroom_assigned',
      timerType:
        test.test_type === 'timed' ? 'full' : test.test_type === 'per_question_timer' ? 'per_question' : 'none',
      durationMinutes: test.duration_minutes,
      perQuestionSeconds: test.per_question_seconds,
      passingMarks: test.passing_marks,
      shuffle: test.shuffle_questions,
      isPublished: false,
      isRepository: true,
      createdFrom: `duplicate_of:${testId}`,
      createdBy,
      folderId: test.folder_id ?? null,
    },
    supabase,
  );
}
