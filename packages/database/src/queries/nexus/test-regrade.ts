/**
 * Re-grading submitted attempts after an answer key was corrected.
 *
 * The gap this closes: getComposedTestQuestions reads correct_answer LIVE from
 * nexus_qb_questions at grading time, so fixing a key silently fixes every
 * FUTURE attempt. Attempts already submitted keep the score, marks and
 * percentage written at submit time, and those are the numbers every report,
 * average and leaderboard reads. The visible symptom was a student's review
 * screen (which replays the live key) disagreeing with the score on their own
 * record, with nothing on either screen to explain why.
 *
 * Two rules this module exists to hold:
 *
 *  1. Grading goes through gradeAgainstDraw, ALWAYS, with the draw the student
 *     actually sat (null when the paper was not drawn). gradeAgainstDraw already
 *     handles a null draw by delegating, so there is one code path rather than a
 *     branch somebody eventually gets backwards. Calling gradeComposedAnswers
 *     directly on a drawn paper misgrades every shuffled sitting and the result
 *     still looks like a perfectly ordinary number.
 *
 *  2. It never touches final_score / final_total_marks / final_percentage /
 *     finalised_at. Those belong to drawing marking (recomputeExamAttemptScore)
 *     and are the axis effectiveAttemptScore reconciles. A re-grade owns the
 *     objective half only.
 */

import { getSupabaseAdminClient } from '../../client';
import type { TypedSupabaseClient } from '../../client';
import {
  attemptDrawKey,
  getComposedTestQuestions,
  gradeAgainstDraw,
  loadAttemptDraws,
} from './test-repository';

const ATTEMPTS = 'nexus_test_attempts';
const PLACEMENTS = 'nexus_test_placements';
const REGRADES = 'nexus_test_regrades';

/** Statuses that carry a score somebody has been told about. */
const SCORED_STATUSES = ['submitted', 'graded'];

export interface NexusRegradeRow {
  attempt_id: string;
  student_id: string;
  student_name: string | null;
  attempt_number: number;
  placement_id: string | null;
  submitted_at: string | null;
  old_score: number | null;
  old_total: number | null;
  old_percentage: number | null;
  new_score: number;
  new_total: number;
  new_percentage: number;
  /** Against the passing mark of the attempt's own run. Null when it has none. */
  old_passed: boolean | null;
  new_passed: boolean | null;
  changed: boolean;
}

export interface NexusRegradeSummary {
  /** Attempts examined, changed or not. */
  attempts: number;
  changed: number;
  moved_up: number;
  moved_down: number;
  /** Crossed the pass mark upward, and downward. The two numbers to read first. */
  now_passing: number;
  now_failing: number;
}

export interface NexusRegradeResult {
  rows: NexusRegradeRow[];
  summary: NexusRegradeSummary;
  /** True when nothing was written, because the caller asked for a preview. */
  dry_run: boolean;
}

export interface RegradeTestInput {
  testId: string;
  /** Narrow to one run. Omit to re-grade every sitting of the paper. */
  placementId?: string | null;
  dryRun: boolean;
  actorId?: string | null;
  reason?: string | null;
}

/** Two decimal places, matching the NUMERIC columns these land in. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pass mark per run, so an attempt is judged by the door it came through. */
async function loadPassingByPlacement(
  testId: string,
  supabase: TypedSupabaseClient,
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  const { data } = await (supabase as any)
    .from(PLACEMENTS)
    .select('id, passing_pct')
    .eq('test_id', testId);
  for (const p of (data || []) as any[]) map.set(p.id, numOrNull(p.passing_pct));
  return map;
}

/**
 * Re-grade every scored attempt on a test against the questions as they stand
 * now, and report what moved.
 *
 * `dryRun` returns exactly the same rows and summary while writing nothing, so
 * the preview a teacher approves cannot disagree with what applying it does.
 */
export async function regradeTestAttempts(
  input: RegradeTestInput,
  client?: TypedSupabaseClient,
): Promise<NexusRegradeResult> {
  const supabase = client || getSupabaseAdminClient();
  const { testId, placementId, dryRun } = input;

  const composed = await getComposedTestQuestions(testId, true, supabase);
  if (composed.length === 0) {
    return {
      rows: [],
      summary: {
        attempts: 0,
        changed: 0,
        moved_up: 0,
        moved_down: 0,
        now_passing: 0,
        now_failing: 0,
      },
      dry_run: dryRun,
    };
  }

  let query = (supabase as any)
    .from(ATTEMPTS)
    .select(
      'id, student_id, placement_id, attempt_number, status, answers, submitted_at, score, total_marks, percentage, users:student_id(name)',
    )
    .eq('test_id', testId)
    .in('status', SCORED_STATUSES);
  if (placementId) query = query.eq('placement_id', placementId);

  const { data: attempts, error } = await query;
  if (error) throw error;

  const [draws, passingBy] = await Promise.all([
    loadAttemptDraws({ testIds: [testId] }, supabase),
    loadPassingByPlacement(testId, supabase),
  ]);

  const rows: NexusRegradeRow[] = [];

  for (const a of (attempts || []) as any[]) {
    const attemptNumber = Number(a.attempt_number) || 1;
    const draw = draws.get(attemptDrawKey(testId, a.student_id, attemptNumber)) || null;
    const passingPct = a.placement_id ? (passingBy.get(a.placement_id) ?? null) : null;

    const graded = gradeAgainstDraw(
      composed,
      draw,
      (a.answers as Record<string, string>) || {},
      passingPct,
    );

    const oldScore = numOrNull(a.score);
    const oldTotal = numOrNull(a.total_marks);
    const oldPct = numOrNull(a.percentage);
    const newScore = round2(graded.score);
    const newTotal = round2(graded.total_marks);
    const newPct = round2(graded.percentage);

    const changed = oldScore !== newScore || oldPct !== newPct || oldTotal !== newTotal;

    rows.push({
      attempt_id: a.id,
      student_id: a.student_id,
      student_name: a.users?.name ?? null,
      attempt_number: attemptNumber,
      placement_id: a.placement_id ?? null,
      submitted_at: a.submitted_at ?? null,
      old_score: oldScore,
      old_total: oldTotal,
      old_percentage: oldPct,
      new_score: newScore,
      new_total: newTotal,
      new_percentage: newPct,
      old_passed: passingPct == null || oldPct == null ? null : oldPct >= passingPct,
      new_passed: passingPct == null ? null : newPct >= passingPct,
      changed,
    });
  }

  // Newest first, which is the order a teacher scans a run in.
  rows.sort((x, y) => (y.submitted_at || '').localeCompare(x.submitted_at || ''));

  const changedRows = rows.filter((r) => r.changed);
  const summary: NexusRegradeSummary = {
    attempts: rows.length,
    changed: changedRows.length,
    moved_up: changedRows.filter((r) => (r.new_percentage ?? 0) > (r.old_percentage ?? 0)).length,
    moved_down: changedRows.filter((r) => (r.new_percentage ?? 0) < (r.old_percentage ?? 0)).length,
    now_passing: changedRows.filter((r) => r.old_passed === false && r.new_passed === true).length,
    now_failing: changedRows.filter((r) => r.old_passed === true && r.new_passed === false).length,
  };

  if (dryRun || changedRows.length === 0) {
    return { rows, summary, dry_run: dryRun };
  }

  // Written one at a time rather than in a single upsert: an upsert on
  // nexus_test_attempts would need every column of every row, and getting one
  // of them wrong here rewrites a student's record with a default.
  for (const r of changedRows) {
    const { error: upErr } = await (supabase as any)
      .from(ATTEMPTS)
      .update({
        score: r.new_score,
        total_marks: r.new_total,
        percentage: r.new_percentage,
      })
      .eq('id', r.attempt_id);
    if (upErr) throw upErr;
  }

  const { error: logErr } = await (supabase as any).from(REGRADES).insert(
    changedRows.map((r) => ({
      test_id: testId,
      placement_id: r.placement_id,
      attempt_id: r.attempt_id,
      student_id: r.student_id,
      old_score: r.old_score,
      old_total: r.old_total,
      old_percentage: r.old_percentage,
      new_score: r.new_score,
      new_total: r.new_total,
      new_percentage: r.new_percentage,
      reason: input.reason ?? null,
      actor_id: input.actorId ?? null,
    })),
  );
  // The scores are already changed by this point. Losing the log is bad, losing
  // it silently is worse, so it is shouted about rather than thrown: throwing
  // here would report failure for a re-grade that actually happened.
  if (logErr) console.error('Re-grade applied but the log insert failed:', logErr.message);

  return { rows, summary, dry_run: false };
}

/** Every recorded score change for one student, newest first. */
export async function listStudentRegrades(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<any[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await (supabase as any)
    .from(REGRADES)
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  return (data || []) as any[];
}
