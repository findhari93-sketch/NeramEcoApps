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
import { effectiveAttemptScore } from './exam-score';
import { gradeQBAnswerStrict } from './question-bank';
import {
  compareSittingAttempts,
  loadRunSittings,
  type RunForSittings,
  type RunSittingSource,
} from './run-sittings';
import {
  answersAsOriginal,
  attemptDrawKey,
  composeTest,
  getComposedTestQuestions,
  gradeAgainstDraw,
  loadAttemptDraws,
} from './test-repository';

const ATTEMPTS = 'nexus_test_attempts';
const TESTS = 'nexus_tests';

/** What a results row is built from, on the paper wide view and on a run. */
const RESULT_ATTEMPT_COLUMNS =
  'id, student_id, score, total_marks, percentage, submitted_at, attempt_number, status, final_score, final_total_marks, final_percentage, finalised_at';
const TEST_QUESTIONS = 'nexus_test_questions';
const QUESTIONS = 'nexus_qb_questions';
const PLACEMENTS = 'nexus_test_placements';
const DRAWINGS = 'drawing_submissions';

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

/**
 * Best percentage and attempt count per test for one student. PAPER WIDE.
 *
 * Every official attempt on the paper, through every door. That is the right
 * answer for "how has this student done on this paper" and the WRONG answer for
 * "how many attempts have they spent on this run".
 *
 * NEVER compare this count against a placement's gating.attempt_limit. A paper
 * is routinely several runs at once, so a chapter practised in Study Materials
 * would spend the exam's single attempt. It did: students who had practised were
 * shown "No attempts left" on an exam they had never sat (NXS-0125).
 *
 * For the per-door count, use loadRunSittings in run-sittings.ts, which is the
 * rule the attempt route and every staff screen already follow.
 */
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
    .select('test_id, attempt_number, answers, submitted_at')
    .eq('student_id', studentId)
    .eq('status', 'submitted')
    // Deliberately NOT filtered to official. This feeds "fix my mistakes", and a
    // question got wrong during revision is still a gap worth revisiting. Nothing
    // here is reported as a score, so a practice run cannot flatter or damage a
    // record; it only changes which questions come back.
    .order('submitted_at', { ascending: true })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));
  if (error) throw error;

  // A drawn paper stores the letter the student CLICKED. Read raw, a correct
  // answer on a shuffled question grades as wrong, and "fix my mistakes" then
  // serves the student questions they actually got right.
  const draws = await loadAttemptDraws(
    { testIds: (attempts || []).map((a: any) => a.test_id), studentId },
    supabase,
  );

  // Oldest first, so a later attempt on the same question simply overwrites the
  // earlier verdict and "wrong but since corrected" resolves itself.
  const latest = new Map<string, { selected: string | null; answered_at: string | null }>();
  for (const a of attempts || []) {
    const draw = a.test_id ? draws.get(attemptDrawKey(a.test_id, studentId, a.attempt_number)) : null;
    const answers = answersAsOriginal(a.answers, draw);
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
  /**
   * The first official sitting. This is the headline on a run, because it is the
   * only number that says what the student knew when the paper was set. Best
   * says how far they got afterwards, which is a different and also useful
   * question, so both are carried rather than one being chosen here.
   */
  first_percentage: number | null;
  first_score: number | null;
  first_total_marks: number | null;
  first_submitted_at: string | null;
  best_percentage: number | null;
  best_score: number | null;
  best_total_marks: number | null;
  last_percentage: number | null;
  last_submitted_at: string | null;
  passed: boolean | null;
  status: NexusTestResultStatus;
  /** The eligibility bucket this student fell in, echoed from the caller's roster. */
  bucket: string | null;
  is_mandatory: boolean | null;
  /** True while a human still has drawings to mark on the winning attempt. */
  provisional: boolean;
  /** A window of this student's own, beyond the run's shared close time. */
  window_open_until: string | null;
  access_request_pending: boolean;
  /**
   * How this student's sitting on the run was decided (run-sittings.ts): their
   * own door, another door inside the window, or a teacher's count. Null on the
   * paper wide view and for anyone with no sitting.
   */
  sat_via: RunSittingSource | null;
  /** When the counted sitting was submitted, for "counted from Study Materials, 28 Aug". */
  sat_via_at: string | null;
  /** A dormant student kept only because they really sat it. Never counted in stats. */
  paused: boolean;
}

export type NexusTestResultStatus =
  | 'submitted'
  | 'in_progress'
  | 'not_started'
  | 'missed'
  | 'excused';

export interface NexusTestResultStats {
  students: number;
  attempts: number;
  average: number | null;
  passed: number;
  /** All null unless the caller supplied a roster, so the paper wide shape is unchanged. */
  roster_total: number | null;
  mandatory: number | null;
  submitted: number | null;
  not_started: number | null;
  missed: number | null;
  excused: number | null;
  average_first: number | null;
  /** Mean marks behind average_first, so the tile never shows a bare percentage. */
  average_first_marks: { score: number; total: number } | null;
  average_best_marks: { score: number; total: number } | null;
  pass_mark_pct: number | null;
}

export interface NexusTestResultsOptions {
  /** Scope to one run. Omit for the paper wide view, which is the original behaviour. */
  placementId?: string | null;
  /**
   * Who this run is answerable for, so students with no attempt can be listed.
   * Omit and no zero attempt row appears, which is exactly what every caller
   * got before this option existed.
   *
   * `bucket` is an opaque string echoed straight back out. The eligibility
   * engine that produces it lives in apps/nexus and this package must not
   * import from an app, so the route composes the two rather than this file
   * growing a second copy of the bucket rules.
   */
  roster?: Array<{
    student_id: string;
    name: string | null;
    avatar_url: string | null;
    bucket: string;
    is_mandatory: boolean;
  }>;
  /** The run's own bar, which overrides the test's passing_marks when set. */
  passingPct?: number | null;
  /** When the run shut. Drives "missed" for anyone who never sat it. */
  closesAt?: string | null;
  /**
   * The run's own window, for rule 2 of run-sittings.ts: an attempt through
   * another door of the paper, started and submitted inside it, counts as
   * sitting the run. Omit and only the run's own door and teacher counts apply.
   */
  runWindow?: { opensAt: string | null; closesAt: string | null } | null;
  /** student_id -> their own window's end, from an approved reopen or catch up. */
  windowsByStudent?: Record<string, string | null>;
  /** Students who have asked to be let back in and are still waiting. */
  pendingRequestStudentIds?: string[];
  /**
   * Dormant (paused) students on the roster. They appear in no list and no
   * count, so a paused student with no sitting is dropped entirely. One who
   * really sat it keeps a row tagged `paused`, so the marks are not lost, but is
   * left out of every stat.
   */
  pausedStudentIds?: string[];
}

/**
 * What to tell a teacher about one student on one run.
 *
 * The rule is borrowed verbatim from buildExamRoster in
 * apps/nexus/src/lib/scheduled-exam-roster.ts: a student with no attempt is not
 * a failure while the door is still open, and becomes "missed" only once it has
 * shut. The two live apart because that one is an app module carrying exam only
 * concerns (proctoring, makeups, per attempt countdowns) and this package
 * cannot import from an app. Kept in step by this comment and by
 * test-analytics.status.test.ts.
 */
export function resolveResultStatus(input: {
  hasSubmitted: boolean;
  hasInProgress: boolean;
  isMandatory: boolean | null;
  closesAt: string | null;
  windowOpenUntil: string | null;
  now: number;
}): NexusTestResultStatus {
  if (input.hasSubmitted) return 'submitted';

  // A student let back in is sitting their own window, so the run's shared close
  // time has stopped describing them.
  const deadline = input.windowOpenUntil ?? input.closesAt;
  const shut = deadline ? Date.parse(deadline) : NaN;
  const doorOpen = !deadline || Number.isNaN(shut) || shut > input.now;

  /**
   * An open attempt only means "sitting it now" while their door is open.
   *
   * Nothing marks a paper abandoned when a student closes the tab any more (the
   * take page used to, and did it before they had even chosen to leave). Read
   * literally, a paper walked away from last month would report as in progress
   * for ever: counted under neither Done nor Not done, never chased, never
   * asked about. Past their deadline it is a missed paper like any other.
   */
  if (input.hasInProgress && doorOpen) return 'in_progress';

  // Not required means nothing is outstanding. Listing them in the chase list is
  // how a teacher learns to stop trusting the chase list.
  if (input.isMandatory === false) return 'excused';

  if (doorOpen) return 'not_started';
  // No roster means no opinion about who owed this paper, so nobody can be
  // missing from a list that was never drawn up.
  return input.isMandatory === true ? 'missed' : 'not_started';
}

/**
 * The mean marks behind a mean percentage, so no tile shows a bare number.
 * One decimal: a class average of 28.4 out of 45 is honest, 28 is not quite.
 */
function meanMarks(
  rows: NexusTestResultRow[],
  scoreKey: 'first_score' | 'best_score',
  totalKey: 'first_total_marks' | 'best_total_marks',
): { score: number; total: number } | null {
  if (rows.length === 0) return null;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    score: round1(rows.reduce((s, r) => s + (r[scoreKey] || 0), 0) / rows.length),
    total: round1(rows.reduce((s, r) => s + (r[totalKey] || 0), 0) / rows.length),
  };
}

function emptyRow(studentId: string): NexusTestResultRow {
  return {
    student_id: studentId,
    student_name: null,
    avatar_url: null,
    attempts: 0,
    first_percentage: null,
    first_score: null,
    first_total_marks: null,
    first_submitted_at: null,
    best_percentage: null,
    best_score: null,
    best_total_marks: null,
    last_percentage: null,
    last_submitted_at: null,
    passed: null,
    status: 'not_started',
    bucket: null,
    is_mandatory: null,
    provisional: false,
    window_open_until: null,
    access_request_pending: false,
    sat_via: null,
    sat_via_at: null,
    paused: false,
  };
}

/**
 * Which attempts still have a drawing nobody has marked.
 *
 * Asked of drawing_submissions rather than inferred from finalised_at, because
 * finalised_at is null on every ordinary MCQ attempt too. Reading it as
 * "provisional" would put a Provisional chip on every class test in the
 * product. This returns an empty set for any paper without a drawing section,
 * which is nearly all of them.
 */
async function loadUnmarkedDrawingAttemptIds(
  attemptIds: string[],
  supabase: TypedSupabaseClient,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (attemptIds.length === 0) return out;
  const { data, error } = await supabase
    .from(DRAWINGS as any)
    .select('exam_attempt_id')
    .in('exam_attempt_id', attemptIds)
    .is('tutor_marks', null);
  // A missing drawing table or column must not take the whole results tab down
  // with it. The score itself is already correct via effectiveAttemptScore; all
  // that is lost here is the chip explaining why it might still move.
  if (error) return out;
  for (const row of (data || []) as any[]) out.add(row.exam_attempt_id);
  return out;
}

/**
 * Who has sat this test and how they did.
 *
 * Two shapes from one function. Without `opts.roster` this is the paper wide
 * view it has always been: only students who actually sat it, and the same four
 * stats. With a roster it becomes a report on one run, and the students who
 * never sat it are the whole point of it.
 *
 * Scores read through effectiveAttemptScore rather than off `percentage`,
 * because a paper with a drawing section is marked in two stages and the raw
 * column holds only the objective half. Reading it directly reported a half
 * marked exam as a real score, which is the bug this replaced.
 */
export async function getTestResults(
  testId: string,
  opts?: NexusTestResultsOptions,
  client?: TypedSupabaseClient,
): Promise<{ rows: NexusTestResultRow[]; stats: NexusTestResultStats }> {
  const supabase = client || getSupabaseAdminClient();
  const now = Date.now();

  const runId = opts?.placementId || null;
  const satVia = new Map<string, { source: RunSittingSource; at: string | null }>();

  const loadAttempts = async (): Promise<any[]> => {
    if (!runId) {
      const { data, error } = await supabase
        .from(ATTEMPTS)
        .select(RESULT_ATTEMPT_COLUMNS)
        .eq('test_id', testId)
        // In progress sittings are read for status only and never touch a score
        // aggregate, so a student mid paper shows as working rather than as absent.
        .in('status', ['submitted', 'in_progress'])
        // Cohort stats. A student practising after completion must not move the
        // class average or the pass rate.
        .eq('mode', 'official')
        .order('submitted_at', { ascending: true })
        // There is no unique constraint on (test_id, student_id, attempt_number),
        // and an in-progress row has no submitted_at at all, so ties need a second
        // key or "first" is whichever row the planner happened to return first.
        .order('attempt_number', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    }

    // Scoped to a run, who sat it is decided by run-sittings.ts rather than by
    // the placement column alone, so an attempt through another door inside the
    // run's window, or a teacher's count, lands here exactly as it does on the
    // exam results and on the student's own card.
    const run: RunForSittings = {
      id: runId,
      test_id: testId,
      available_from: opts?.runWindow?.opensAt ?? null,
      available_until: opts?.runWindow?.closesAt ?? null,
    };
    const rosterIds = opts?.roster?.length ? opts.roster.map((m) => m.student_id) : null;
    const byRun = await loadRunSittings<any>(
      [run],
      { studentIds: rosterIds, columns: RESULT_ATTEMPT_COLUMNS },
      supabase,
    );
    const out: any[] = [];
    for (const sitting of (byRun.get(runId) || new Map()).values()) {
      satVia.set(sitting.student_id, { source: sitting.source, at: sitting.first?.submitted_at ?? null });
      for (const a of sitting.attempts) {
        if (a.status === 'submitted' || a.status === 'in_progress') out.push(a);
      }
    }
    return out.sort(compareSittingAttempts);
  };

  const [attempts, { data: test }] = await Promise.all([
    loadAttempts(),
    supabase.from(TESTS).select('passing_marks, total_marks').eq('id', testId).maybeSingle(),
  ]);

  const bar =
    opts?.passingPct != null
      ? Number(opts.passingPct)
      : test?.passing_marks != null && Number(test.total_marks) > 0
        ? (Number(test.passing_marks) / Number(test.total_marks)) * 100
        : null;

  const submitted = (attempts || []).filter((a: any) => a.status === 'submitted');
  const unmarked = await loadUnmarkedDrawingAttemptIds(
    submitted.map((a: any) => a.id).filter(Boolean),
    supabase,
  );

  const byStudent = new Map<string, NexusTestResultRow>();
  const inProgressBy = new Set<string>();
  // Which attempt currently owns each student's best, so the provisional flag
  // describes the score actually on screen rather than any attempt at all.
  const bestAttemptId = new Map<string, string>();

  for (const a of (attempts || []) as any[]) {
    const row = byStudent.get(a.student_id) || emptyRow(a.student_id);
    if (a.status === 'in_progress') {
      inProgressBy.add(a.student_id);
      byStudent.set(a.student_id, row);
      continue;
    }
    const eff = effectiveAttemptScore(a);
    const pct = a.percentage == null && a.final_percentage == null ? null : eff.percentage;

    row.attempts += 1;
    if (pct != null) {
      if (row.first_percentage == null) {
        row.first_percentage = pct;
        row.first_score = eff.score;
        row.first_total_marks = eff.total_marks;
        row.first_submitted_at = a.submitted_at;
      }
      if (row.best_percentage == null || pct > row.best_percentage) {
        row.best_percentage = pct;
        row.best_score = eff.score;
        row.best_total_marks = eff.total_marks;
        bestAttemptId.set(a.student_id, a.id);
      }
      row.last_percentage = pct;
    }
    row.last_submitted_at = a.submitted_at;
    byStudent.set(a.student_id, row);
  }

  // Everyone the run was set for, whether they turned up or not. This is the
  // half the results tab never had, and the reason a teacher could not tell a
  // finished class from a class that ignored the paper.
  for (const member of opts?.roster || []) {
    const row = byStudent.get(member.student_id) || emptyRow(member.student_id);
    row.student_name = member.name;
    row.avatar_url = member.avatar_url;
    row.bucket = member.bucket;
    row.is_mandatory = member.is_mandatory;
    byStudent.set(member.student_id, row);
  }

  const pending = new Set(opts?.pendingRequestStudentIds || []);
  const rows = [...byStudent.values()];

  for (const r of rows) {
    r.window_open_until = opts?.windowsByStudent?.[r.student_id] ?? null;
    r.access_request_pending = pending.has(r.student_id);
    const via = satVia.get(r.student_id);
    r.sat_via = via?.source ?? null;
    r.sat_via_at = via?.at ?? null;
    r.provisional = unmarked.has(bestAttemptId.get(r.student_id) || '');
    r.status = resolveResultStatus({
      hasSubmitted: r.attempts > 0,
      hasInProgress: inProgressBy.has(r.student_id),
      isMandatory: r.is_mandatory,
      closesAt: opts?.closesAt ?? null,
      windowOpenUntil: r.window_open_until,
      now,
    });
  }

  // Paused students leave the report unless they really sat it. Spliced in place
  // so every read below sees the same list.
  const pausedIds = new Set(opts?.pausedStudentIds || []);
  if (pausedIds.size > 0) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (!pausedIds.has(r.student_id)) continue;
      if (r.attempts > 0 || inProgressBy.has(r.student_id)) r.paused = true;
      else rows.splice(i, 1);
    }
  }

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
      // The roster already carried a name for anyone on it. Only fall back to
      // the lookup, so a roster entry is never blanked by a missing users row.
      r.student_name = u?.name ?? r.student_name ?? null;
      r.avatar_url = u?.avatar_url ?? r.avatar_url ?? null;
      r.passed = bar == null ? null : r.best_percentage != null && r.best_percentage >= bar;
    }
  }

  rows.sort((a, b) => (b.best_percentage ?? -1) - (a.best_percentage ?? -1));
  // A paused student's row is shown for their marks but never counted.
  const counted = rows.filter((r) => !r.paused);
  const scored = counted.filter((r) => r.best_percentage != null);
  const firstScored = counted.filter((r) => r.first_percentage != null);
  const hasRoster = (opts?.roster?.length ?? 0) > 0;
  const countedStudentIds = new Set(counted.map((r) => r.student_id));

  return {
    rows,
    stats: {
      // Unchanged, so the paper wide view reads exactly as it always has: these
      // four count the people who actually sat it, never the roster, even when
      // a roster has added rows for the students who did not.
      students: counted.filter((r) => r.attempts > 0).length,
      attempts: submitted.filter((a: any) => countedStudentIds.has(a.student_id)).length,
      average:
        scored.length > 0
          ? Math.round(scored.reduce((s, r) => s + (r.best_percentage || 0), 0) / scored.length)
          : null,
      passed: counted.filter((r) => r.passed).length,
      // Null without a roster, because there is no list to be absent from.
      roster_total: hasRoster ? counted.length : null,
      mandatory: hasRoster ? counted.filter((r) => r.is_mandatory === true).length : null,
      submitted: hasRoster ? counted.filter((r) => r.status === 'submitted').length : null,
      not_started: hasRoster ? counted.filter((r) => r.status === 'not_started').length : null,
      missed: hasRoster ? counted.filter((r) => r.status === 'missed').length : null,
      excused: hasRoster ? counted.filter((r) => r.status === 'excused').length : null,
      average_first:
        firstScored.length > 0
          ? Math.round(firstScored.reduce((s, r) => s + (r.first_percentage || 0), 0) / firstScored.length)
          : null,
      average_first_marks: meanMarks(firstScored, 'first_score', 'first_total_marks'),
      average_best_marks: meanMarks(scored, 'best_score', 'best_total_marks'),
      pass_mark_pct: bar == null ? null : Math.round(bar * 100) / 100,
    },
  };
}

/** One question, as answered on one attempt: the response sheet row. */
export interface NexusAttemptReviewItem {
  question_id: string;
  question_text: string | null;
  options: unknown;
  correct_answer: string | null;
  selected: string | null;
  is_correct: boolean;
  is_gradable: boolean;
  explanation: string | null;
  explanation_detailed: string | null;
}

/** One sitting, fully replayed. */
export interface NexusReplayedAttempt {
  attempt_id: string;
  attempt_number: number;
  mode: 'official' | 'revision';
  status: string | null;
  placement_id: string | null;
  started_at: string | null;
  submitted_at: string | null;
  time_spent_seconds: number | null;
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  provisional: boolean;
  review: NexusAttemptReviewItem[];
}

/**
 * Every submitted attempt one student made on one paper, each replayed into a
 * full per-question review.
 *
 * The attempt row only ever stored the raw answers (`{questionId: 'a'}`), never
 * which were right, so a sheet has to be reconstructed. This is the read-only
 * counterpart to gradeAgainstDraw, the same core submitAttempt uses, which is
 * what stops a replayed review disagreeing with what the student was actually
 * shown. The composed paper is fetched once and reused across every attempt:
 * it is the same paper for all of them, only the draw and the answers differ.
 *
 * score/total_marks/percentage are read off the attempt row AS STORED, not
 * recomputed, so a teacher reviewing an old sitting sees the number it was
 * graded at even if the answer key has since been edited. They pass through
 * effectiveAttemptScore only so a two-stage exam reports its marked total
 * rather than the objective half. `passed` is compared against the CURRENT
 * configured bar, matching how the rest of the feature treats passing_pct.
 *
 * Generalised out of getStudyFileAttemptReview, which now calls it. Everything
 * that function did after resolving which test a chapter holds was already
 * test agnostic.
 */
export async function getStudentTestAttemptReview(
  input: {
    testId: string;
    studentId: string;
    /** Restrict to one run. Omit for every attempt on the paper. */
    placementId?: string | null;
    /** The bar each attempt is judged against. Defaults to the test's own. */
    passingPct?: number | null;
    /** Include revision mode sittings. Default true. */
    includeRevision?: boolean;
  },
  client?: TypedSupabaseClient,
): Promise<{
  test: { test_id: string; title: string; passing_pct: number | null } | null;
  attempts: NexusReplayedAttempt[];
}> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from(ATTEMPTS)
    .select(
      'id, attempt_number, mode, status, placement_id, answers, score, total_marks, percentage, started_at, submitted_at, time_spent_seconds, final_score, final_total_marks, final_percentage, finalised_at',
    )
    .eq('test_id', input.testId)
    .eq('student_id', input.studentId)
    .eq('status', 'submitted')
    .order('attempt_number', { ascending: true });
  if (input.placementId) query = query.eq('placement_id', input.placementId);
  if (input.includeRevision === false) query = query.eq('mode', 'official');

  const [{ data: rows, error }, { data: testRow }] = await Promise.all([
    query,
    supabase.from(TESTS).select('id, title, passing_marks, total_marks').eq('id', input.testId).maybeSingle(),
  ]);
  if (error) throw error;

  const bar =
    input.passingPct != null
      ? Number(input.passingPct)
      : (testRow as any)?.passing_marks != null && Number((testRow as any).total_marks) > 0
        ? (Number((testRow as any).passing_marks) / Number((testRow as any).total_marks)) * 100
        : null;

  const test = testRow
    ? { test_id: input.testId, title: (testRow as any).title || 'Test', passing_pct: bar }
    : null;

  if (!rows || rows.length === 0) return { test, attempts: [] };

  const numbers = rows.map((a: any) => Number(a.attempt_number) || 1);

  // One read of the draws for every attempt, rather than one per attempt. Seven
  // retakes used to mean seven round trips to render one drawer.
  const [composed, { data: drawRows, error: drawError }, unmarked] = await Promise.all([
    getComposedTestQuestions(input.testId, true, supabase),
    supabase
      .from('nexus_test_draws' as any)
      .select('attempt_number, question_ids, option_maps')
      .eq('test_id', input.testId)
      .eq('student_id', input.studentId)
      .in('attempt_number', numbers),
    loadUnmarkedDrawingAttemptIds(rows.map((a: any) => a.id).filter(Boolean), supabase),
  ]);
  if (drawError) throw drawError;

  const drawByNumber = new Map<number, any>(
    ((drawRows || []) as any[]).map((d) => [
      Number(d.attempt_number),
      {
        attempt_number: Number(d.attempt_number),
        question_ids: (d.question_ids as string[]) || [],
        option_maps: (d.option_maps as Record<string, string[]>) || {},
      },
    ]),
  );

  const attempts: NexusReplayedAttempt[] = (rows as any[]).map((a) => {
    const attemptNumber = Number(a.attempt_number) || 1;
    const eff = effectiveAttemptScore(a);
    const graded = gradeAgainstDraw(
      composed,
      drawByNumber.get(attemptNumber) ?? null,
      (a.answers as Record<string, string>) || {},
      bar ?? 0,
    );
    const byId = new Map(graded.questions.map((q: any) => [q.question_id, q]));

    return {
      attempt_id: a.id,
      attempt_number: attemptNumber,
      mode: (a.mode as 'official' | 'revision') ?? 'official',
      status: a.status ?? null,
      placement_id: a.placement_id ?? null,
      started_at: a.started_at ?? null,
      submitted_at: a.submitted_at ?? null,
      time_spent_seconds: a.time_spent_seconds == null ? null : Number(a.time_spent_seconds),
      score: eff.score,
      total_marks: eff.total_marks,
      percentage: eff.percentage,
      passed: bar == null ? true : eff.percentage >= bar,
      provisional: unmarked.has(a.id),
      review: graded.review.map((r: any) => {
        const q = byId.get(r.question_id) as any;
        return {
          question_id: r.question_id,
          question_text: q?.question_text ?? null,
          options: q?.options ?? null,
          correct_answer: r.correct_answer,
          selected: r.selected,
          is_correct: r.is_correct,
          is_gradable: r.is_gradable,
          explanation: q?.explanation_brief ?? null,
          explanation_detailed: q?.explanation_detailed ?? null,
        };
      }),
    };
  });

  return { test, attempts };
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
  /**
   * How many picked each option, keyed by the option's own id, after undoing
   * any shuffle. Null for a question with no options (numerical, drawing).
   * Feeds the per-option bars on the questions list.
   */
  option_counts: Record<string, number> | null;
  /** Under this, the question is more likely broken than hard. */
  needs_review: boolean;
}

/** How low a correct rate has to be before the question itself is the suspect. */
export const QUESTION_REVIEW_THRESHOLD_PCT = 20;

/**
 * The option id an answer names, matched case-insensitively, or the answer
 * itself when no option matches (a numerical value, or a stale id).
 */
function optionKeyFor(options: Array<{ id?: string }> | null, selected: string): string {
  const raw = String(selected).trim();
  if (!options) return raw;
  const wanted = raw.toLowerCase();
  const hit = options.find((o) => typeof o?.id === 'string' && o.id.trim().toLowerCase() === wanted);
  return hit?.id ?? raw;
}

/**
 * Per question: how many got it right, and which wrong option pulled the most
 * people. This is the loop that keeps a growing bank trustworthy, because a
 * question everyone fails is usually ambiguous rather than difficult.
 */
export async function getQuestionAnalysis(
  testId: string,
  opts?: {
    placementId?: string | null;
    /**
     * The run itself, so students who sat it through another door inside its
     * window (or whom a teacher counted) contribute their sitting too. Pass the
     * roster as studentIds whenever it is known, to bound the read.
     */
    run?: RunForSittings | null;
    studentIds?: string[] | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusQuestionAnalysisRow[]> {
  const supabase = client || getSupabaseAdminClient();

  // Per-question difficulty for the teacher. Official attempts only, for the
  // same reason as the cohort stats above.
  let attemptQuery = supabase
    .from(ATTEMPTS)
    .select('student_id, attempt_number, answers')
    .eq('test_id', testId)
    .eq('status', 'submitted')
    .eq('mode', 'official');
  // Scoped to a run, a self-study cohort's answers stop dragging the class
  // test's question quality signal around. A question the class found hard is
  // a different fact from one that a hundred practising strangers found hard.
  if (opts?.placementId) attemptQuery = attemptQuery.eq('placement_id', opts.placementId);

  // A run also counts the one sitting of each student who sat it through another
  // door inside its window, or whom a teacher counted, so the question signal
  // covers the same people the Students tab calls done. Their first attempt
  // only: that is the sitting, and the tries around it were practice.
  const run = opts?.run ?? null;
  const counted: Promise<any[]> = run
    ? loadRunSittings<any>([run], { studentIds: opts?.studentIds ?? null, columns: 'answers' }, supabase).then(
        (byRun) =>
          [...(byRun.get(run.id) || new Map()).values()]
            .filter((s) => s.source !== 'run' && s.first)
            .map((s) => s.first),
      )
    : Promise.resolve([]);

  const [questions, { data: attempts, error }, draws, extra] = await Promise.all([
    getComposedTestQuestions(testId, true, supabase),
    attemptQuery,
    loadAttemptDraws({ testIds: [testId] }, supabase),
    counted,
  ]);
  if (error) throw error;
  if (questions.length === 0) return [];

  // Every sheet in the bank's own lettering, translated once rather than once
  // per question. Reading them raw is the bug that reported 25% right on a run
  // that had scored 87%, and "0 of 9, most picked Copper Age" on a question all
  // nine had answered Bronze Age: a drawn paper stores the letter they CLICKED.
  const sheets = [...((attempts || []) as any[]), ...extra].map((a) =>
    answersAsOriginal(a.answers, draws.get(attemptDrawKey(testId, a.student_id, a.attempt_number))),
  );

  return questions.map((q) => {
    let answered = 0;
    let correct = 0;
    const wrongCounts = new Map<string, number>();
    const options = Array.isArray(q.options) ? (q.options as Array<{ id?: string; text?: string }>) : null;
    const optionCounts: Record<string, number> | null = options && options.length > 0 ? {} : null;

    for (const sheet of sheets) {
      const selected = sheet[q.question_id];
      if (selected == null || selected === '') continue;
      const verdict = gradeQBAnswerStrict(q.question_format, selected, q.correct_answer, (q as any).answer_tolerance);
      if (verdict === null) continue;
      answered += 1;
      // Keyed by the option's own id, so a stored 'B' and 'b' land on one bar.
      const key = optionKeyFor(options, selected);
      if (optionCounts) optionCounts[key] = (optionCounts[key] || 0) + 1;
      if (verdict) correct += 1;
      else wrongCounts.set(key, (wrongCounts.get(key) || 0) + 1);
    }

    let topWrong: NexusQuestionAnalysisRow['top_wrong_option'] = null;
    for (const [key, count] of wrongCounts.entries()) {
      if (!topWrong || count > topWrong.count) {
        const option = options ? options.find((o) => o?.id === key) : null;
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
      option_counts: optionCounts,
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
