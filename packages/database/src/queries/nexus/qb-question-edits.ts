/**
 * The audit trail for question edits made from the test results screen.
 *
 * nexus_qb_questions carries created_by, created_at and updated_at, and no
 * updated_by or revision history of any kind. That was survivable while editing
 * a question meant deliberately navigating to the paper workspace. The results
 * screen now offers "fix this question" one tap from the analysis that flagged
 * it, including a path where an AI rewrites four fields at once, so an edit to a
 * question forty students have already sat has to leave a record.
 *
 * Best-effort by design. A failed audit insert is logged loudly and never fails
 * the edit: refusing to save a corrected answer key because a log row would not
 * write is the wrong trade, and reporting failure for an edit that actually
 * landed is worse than either.
 */

import { getSupabaseAdminClient } from '../../client';
import type { TypedSupabaseClient } from '../../client';

const EDITS = 'nexus_qb_question_edits';

/** Which surface the edit came from, for reading the log later. */
export type NexusQuestionEditSource = 'inline' | 'ai_review';

export interface RecordQuestionEditInput {
  questionId: string;
  /** The run the teacher was looking at. Context only, deliberately unconstrained. */
  testId?: string | null;
  editedBy?: string | null;
  source: NexusQuestionEditSource;
  /** Only the fields that actually changed, so the row stays readable. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * Returns the new row's id, so an AI check can point at the edit it produced,
 * or null when the audit insert failed (logged, never thrown).
 */
export async function recordQuestionEdit(
  input: RecordQuestionEditInput,
  client?: TypedSupabaseClient,
): Promise<string | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from(EDITS)
    .insert({
      question_id: input.questionId,
      test_id: input.testId ?? null,
      edited_by: input.editedBy ?? null,
      source: input.source,
      before: input.before || {},
      after: input.after || {},
    })
    .select('id')
    .single();
  if (error) {
    console.error('Question edit audit insert failed:', error.message);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

export interface NexusQuestionEdit {
  id: string;
  question_id: string;
  test_id: string | null;
  edited_by: string | null;
  source: NexusQuestionEditSource;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  created_at: string;
}

/** The edit history of one question, newest first. */
export async function listQuestionEdits(
  questionId: string,
  client?: TypedSupabaseClient,
): Promise<NexusQuestionEdit[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await (supabase as any)
    .from(EDITS)
    .select('*')
    .eq('question_id', questionId)
    .order('created_at', { ascending: false });
  return (data || []) as NexusQuestionEdit[];
}

/**
 * How many scored attempts already exist on a test.
 *
 * The number that turns "your change is saved" into "your change is saved, and
 * sixteen people were graded on the old answer". Without it the re-grade offer
 * has nothing to say and the teacher never learns the old scores went stale.
 */
export async function countScoredAttempts(
  testId: string,
  placementId?: string | null,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  let query = (supabase as any)
    .from('nexus_test_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('test_id', testId)
    .in('status', ['submitted', 'graded']);
  if (placementId) query = query.eq('placement_id', placementId);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}
