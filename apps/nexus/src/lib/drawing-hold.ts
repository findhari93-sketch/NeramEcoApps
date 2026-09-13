/**
 * Holding a drawing review until it is deliberately handed back.
 *
 * A held review is finished on the teacher's side and invisible on the
 * student's. It keeps `drawing_submissions.status = 'submitted'`, which is why
 * the student's own page needs no change at all, and it carries a manual
 * `drawing_evaluation` row with an `intent` and no `released_at` yet.
 *
 * Nothing the student can perceive happens here. The status flip, the voice
 * note being marked sent, the points and the Teams card all belong to the
 * release, because those are the things a student sees.
 */

const MANUAL_PROMPT_VERSION = 'manual-canvas-v1';

export type ReleaseMode = 'immediate' | 'held';
export type ReviewIntent = 'complete' | 'redo';

/**
 * How an assignment hands back its reviews.
 *
 * Anything unexpected answers 'immediate', which is today's behaviour. That
 * includes an environment without the column: a missing migration must never
 * silently start holding reviews that teachers expect to have sent.
 */
export async function releaseModeFor(supabase: any, assignmentId: string | null): Promise<ReleaseMode> {
  if (!assignmentId) return 'immediate';
  try {
    const { data, error } = await supabase
      .from('nexus_class_assignments')
      .select('review_release_mode')
      .eq('id', assignmentId)
      .maybeSingle();
    if (error || !data) return 'immediate';
    return data.review_release_mode === 'held' ? 'held' : 'immediate';
  } catch {
    return 'immediate';
  }
}

/** Submissions, out of the ones given, whose review is finished but not handed back. */
export async function heldSubmissionIds(supabase: any, submissionIds: string[]): Promise<Set<string>> {
  if (submissionIds.length === 0) return new Set();
  try {
    const { data } = await supabase
      .from('drawing_evaluation')
      .select('submission_id')
      .in('submission_id', submissionIds)
      .eq('source', 'manual')
      .not('intent', 'is', null)
      .is('released_at', null);
    return new Set(((data ?? []) as Array<{ submission_id: string }>).map((r) => r.submission_id));
  } catch {
    return new Set();
  }
}

export interface HoldArgs {
  supabase: any;
  /** Kept for callers that already hold the narrowed evaluation client. */
  evalDb?: unknown;
  submissionId: string;
  userId: string;
  intent: ReviewIntent;
  /** The review fields, saved exactly as a draft saves them: status untouched. */
  fields: Record<string, unknown>;
}

export async function holdReview({ supabase, submissionId, userId, intent, fields }: HoldArgs) {
  const now = new Date().toISOString();

  const { error: saveError } = await supabase
    .from('drawing_submissions')
    .update(fields)
    .eq('id', submissionId);
  if (saveError) throw new Error(`Could not save the review: ${saveError.message}`);

  const { data: existing } = await supabase
    .from('drawing_evaluation')
    .select('id')
    .eq('submission_id', submissionId)
    .eq('source', 'manual')
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('drawing_evaluation')
      .update({
        intent,
        status: 'reviewed',
        // Re-holding something already handed back takes it out again: the
        // teacher has changed their mind, and the next release should carry it.
        released_at: null,
        release_batch_id: null,
        reviewed_by: userId,
        reviewed_at: now,
      })
      .eq('id', existing.id);
    if (error) throw new Error(`Could not hold the review: ${error.message}`);
  } else {
    const { error } = await supabase.from('drawing_evaluation').insert({
      submission_id: submissionId,
      source: 'manual',
      status: 'reviewed',
      provider: 'manual',
      prompt_version: MANUAL_PROMPT_VERSION,
      intent,
      created_by: userId,
      reviewed_by: userId,
      reviewed_at: now,
    });
    if (error) throw new Error(`Could not hold the review: ${error.message}`);
  }

  const heldCount = await heldCountForSubmission(supabase, submissionId);
  return { intent, heldCount };
}

/** How many reviews are waiting to be handed back on this drawing's assignment. */
async function heldCountForSubmission(supabase: any, submissionId: string): Promise<number> {
  try {
    const { data: sub } = await supabase
      .from('drawing_submissions')
      .select('assignment_id')
      .eq('id', submissionId)
      .maybeSingle();
    if (!sub?.assignment_id) return 0;
    const { data: siblings } = await supabase
      .from('drawing_submissions')
      .select('id')
      .eq('assignment_id', sub.assignment_id);
    const ids = ((siblings ?? []) as Array<{ id: string }>).map((r) => r.id);
    return (await heldSubmissionIds(supabase, ids)).size;
  } catch {
    return 0;
  }
}
