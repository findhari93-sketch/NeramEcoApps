/**
 * The small, import-light half of AI draft claims: when a 'running' claim
 * counts as abandoned, and how live drafts are retired.
 *
 * Its own module so routes that only read or retire drafts (the estimate, the
 * submission route when a photo is replaced) do not import the drafting path,
 * which loads sharp's native binary on every cold start.
 */

import { describeError } from '@/lib/api-errors';

/** A running claim older than this belongs to a run that died. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

export function isStaleClaim(createdAt: string | null | undefined, now: Date): boolean {
  const at = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(at)) return true;
  return now.getTime() - at > STALE_CLAIM_MS;
}

/**
 * Retire live AI drafts for one sheet. Used by "Draft again" (draft rows) and
 * when a student replaces their photo (running and draft rows, plus the record
 * of an automatic turn, which described the old photo).
 *
 * Best effort: logs and carries on, because neither caller should fail over it.
 */
export async function supersedeAiDrafts(
  admin: any,
  submissionId: string,
  opts: { statuses?: string[]; clearRotation?: boolean } = {},
): Promise<void> {
  const statuses = opts.statuses ?? ['running', 'draft'];
  try {
    const { error } = await admin
      .from('drawing_evaluation')
      .update({ status: 'superseded' })
      .eq('submission_id', submissionId)
      .eq('source', 'ai')
      .in('status', statuses);
    if (error) console.error('drawing drafts: could not supersede drafts for', submissionId, describeError(error));

    if (opts.clearRotation) {
      const { error: rotationError } = await admin
        .from('drawing_submissions')
        .update({ auto_rotated_deg: null })
        .eq('id', submissionId);
      if (rotationError) {
        console.error('drawing drafts: could not clear auto_rotated_deg for', submissionId, describeError(rotationError));
      }
    }
  } catch (err) {
    console.error('drawing drafts: supersede failed for', submissionId, describeError(err));
  }
}
