/**
 * Proctoring signals logged while a student sat a proctoring_enabled exam:
 * tab switches, window blur, fullscreen exits. See
 * 20260901090100_nexus_scheduled_test_practice_proctoring.sql for the table
 * and the "best-effort diagnostics, not a security boundary" rationale.
 *
 * A failure to record a violation must never fail or block the attempt it
 * describes -- same posture as nexus_test_attempt_errors. What IS enforced is
 * the auto-submit decision the caller makes from the count this module returns.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

const VIOLATIONS = 'nexus_test_attempt_violations' as any;

export type AttemptViolationKind = 'tab_switch' | 'window_blur' | 'fullscreen_exit';

export interface AttemptViolation {
  id: string;
  attempt_id: string;
  test_id: string;
  student_id: string;
  kind: AttemptViolationKind;
  detail: unknown;
  created_at: string;
}

/** Logs one violation and returns the running count for that attempt. */
export async function recordAttemptViolation(
  input: {
    attemptId: string;
    testId: string;
    studentId: string;
    kind: AttemptViolationKind;
    detail?: unknown;
  },
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(VIOLATIONS).insert({
    attempt_id: input.attemptId,
    test_id: input.testId,
    student_id: input.studentId,
    kind: input.kind,
    detail: input.detail ?? null,
  });
  if (error) throw error;
  return countAttemptViolations(input.attemptId, supabase);
}

export async function countAttemptViolations(
  attemptId: string,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from(VIOLATIONS)
    .select('id', { count: 'exact', head: true })
    .eq('attempt_id', attemptId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Every violation for a test, summed per student across all of that student's
 * attempts -- a retake must not quietly reset a pattern the teacher should
 * see. Batched for the invigilation roster: one query for every student.
 */
export async function getViolationCountsForTest(
  testId: string,
  studentIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, number>> {
  const supabase = client || getSupabaseAdminClient();
  const map = new Map<string, number>();
  if (studentIds.length === 0) return map;
  const { data, error } = await supabase
    .from(VIOLATIONS)
    .select('student_id')
    .eq('test_id', testId)
    .in('student_id', studentIds);
  if (error) throw error;
  for (const row of (data || []) as any[]) {
    map.set(row.student_id, (map.get(row.student_id) || 0) + 1);
  }
  return map;
}
