/**
 * What a child scored on the tests attached to their classes.
 *
 * Shared by /api/parent/classes/[classId] (the test on one class) and
 * /api/parent/tests (every test, with a rollup). One implementation, because a
 * parent who saw "passed" on the class sheet and "not passed" on the Tests tab
 * would rightly stop trusting both.
 *
 * THREE TRAPS THIS MODULE EXISTS TO GET RIGHT
 * -------------------------------------------
 * 1. nexus_test_attempts has NO `passed` column. Passing is derived against the
 *    placement's own passing_pct, using >= to match the graders in
 *    packages/database/src/queries/nexus/class-prep.ts. Inventing a different
 *    comparison here would let a child who scored exactly the pass mark read as
 *    failed to their parent and passed to their teacher.
 *
 * 2. Only status='submitted' rows are attempts. The abandon route writes a
 *    status the CHECK constraint rejects, so stale 'in_progress' rows exist in
 *    the table. Counting them would tell a parent their child had sat a test
 *    four times when they opened it four times and finished once.
 *
 * 3. nexus_test_placements is polymorphic with NO foreign key. context_type must
 *    always be pinned alongside context_id, or a classroom id could match a row
 *    keyed on a class id and attach a stranger's test to the class.
 */

import { getSupabaseAdminClient } from '@neram/database';
import type { ParentTestDetail, ParentTestKind } from '@/lib/parent-view-types';

/** Matches CLASS_PREP_DEFAULT_PASSING_PCT in queries/nexus/class-prep.ts. */
export const CLASS_PREP_DEFAULT_PASSING_PCT = 70;
/** Matches CATCHUP_PASSING_PCT in queries/nexus/catchup-test.ts. */
export const CATCHUP_DEFAULT_PASSING_PCT = 85;

/**
 * PURE. Did this score pass?
 *
 * Returns null when there is nothing to judge, which is NOT the same as false.
 * A child who has not sat the test has not failed it.
 */
export function derivePassed(
  bestPct: number | null,
  passingPct: number,
  attempts: number
): boolean | null {
  if (attempts <= 0) return null;
  if (bestPct === null) return null;
  // >= not >, matching the grader. A child who scores exactly the pass mark
  // passed, and the two screens must agree on that.
  return bestPct >= passingPct;
}

export function defaultPassingPct(contextType: string): number {
  return contextType === 'catchup_class'
    ? CATCHUP_DEFAULT_PASSING_PCT
    : CLASS_PREP_DEFAULT_PASSING_PCT;
}

export interface ParentTestSummary {
  total: number;
  attempted: number;
  passed: number;
  /**
   * Mean best score across ATTEMPTED tests only.
   * null when nothing has been attempted: an average of no scores is not 0.
   */
  averageBestPct: number | null;
}

/** PURE. The rollup for the Tests tab header. */
export function summariseTests(tests: ParentTestDetail[]): ParentTestSummary {
  const list = tests || [];
  const attempted = list.filter((t) => t.attempts > 0);
  const scored = attempted
    .map((t) => t.bestPct)
    .filter((p): p is number => typeof p === 'number');

  return {
    total: list.length,
    attempted: attempted.length,
    passed: attempted.filter((t) => t.passed === true).length,
    averageBestPct: scored.length
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : null,
  };
}

export interface ParentTestWithClass extends ParentTestDetail {
  classId: string | null;
  classTitle: string | null;
  classDate: string | null;
}

/**
 * Every class-linked test across a set of classes, with this child's results.
 *
 * Batched: three queries regardless of how many classes are passed in, so the
 * whole-term Tests tab costs the same as one class's sheet.
 */
export async function loadParentTests(
  studentId: string,
  classIds: string[],
  classMeta?: Map<string, { title: string; date: string }>
): Promise<ParentTestWithClass[]> {
  if (!classIds.length) return [];

  const supabase = getSupabaseAdminClient();

  // nexus_test_placements is absent from database.generated.ts, same type-gen
  // gap as nexus_class_absences. Documented `as any` pattern, see parent-data.ts.
  const { data: placementRows } = await (
    supabase.from('nexus_test_placements' as any) as any
  )
    .select('id, test_id, context_type, context_id, passing_pct')
    .in('context_type', ['class_prep_test', 'catchup_class'])
    .in('context_id', classIds)
    .eq('is_active', true);

  const placements = (placementRows || []) as {
    id: string;
    test_id: string;
    context_type: string;
    context_id: string;
    passing_pct: number | null;
  }[];
  if (!placements.length) return [];

  const testIds = Array.from(new Set(placements.map((p) => p.test_id)));

  const [tests, attempts] = await Promise.all([
    (async (): Promise<{ id: string; title: string | null }[]> => {
      const { data } = await supabase
        .from('nexus_tests')
        .select('id, title')
        .in('id', testIds);
      return (data || []) as { id: string; title: string | null }[];
    })(),
    (async () => {
      const { data } = await (supabase.from('nexus_test_attempts' as any) as any)
        .select('test_id, percentage, score, total_marks, submitted_at')
        // Submitted only. See trap 2 in the module docblock.
        .eq('status', 'submitted')
        // Official only. A parent must never be shown a practice run on an
        // already-completed chapter as though it were their child's result.
        .eq('mode', 'official')
        .eq('student_id', studentId)
        .in('test_id', testIds);
      return (data || []) as {
        test_id: string;
        percentage: number | null;
        score: number | null;
        total_marks: number | null;
        submitted_at: string | null;
      }[];
    })(),
  ]);

  const titleById = new Map(tests.map((t) => [t.id, t.title]));

  return placements.map((placement) => {
    const mine = attempts.filter((a) => a.test_id === placement.test_id);
    const passingPct = placement.passing_pct ?? defaultPassingPct(placement.context_type);

    const best = mine.reduce<number | null>((acc, a) => {
      const pct = typeof a.percentage === 'number' ? a.percentage : null;
      if (pct === null) return acc;
      return acc === null || pct > acc ? pct : acc;
    }, null);
    const bestRow = best === null ? null : (mine.find((a) => a.percentage === best) ?? null);
    const lastAt = mine
      .map((a) => a.submitted_at)
      .filter((s): s is string => !!s)
      .sort()
      .pop();

    const meta = classMeta?.get(placement.context_id);

    return {
      testId: placement.test_id,
      title: titleById.get(placement.test_id) || 'Class test',
      kind: (placement.context_type === 'catchup_class'
        ? 'catchup_class'
        : 'class_prep') as ParentTestKind,
      passingPct,
      attempts: mine.length,
      // null, never 0, when never attempted.
      bestPct: mine.length ? best : null,
      bestScore: bestRow?.score ?? null,
      totalMarks: bestRow?.total_marks ?? null,
      passed: derivePassed(best, passingPct, mine.length),
      lastAttemptAt: lastAt ?? null,
      /**
       * Not published. A class-wide attempt total would need a roster-wide read
       * of nexus_test_attempts, and unlike assignment submissions there is no
       * existing teacher-facing count to agree with, so a number invented here
       * could contradict the teacher's screen. Left null rather than shipped
       * half right; the UI renders the small-group line, which is honest.
       */
      aggregate: null,
      classId: placement.context_id,
      classTitle: meta?.title ?? null,
      classDate: meta?.date ?? null,
    };
  });
}
