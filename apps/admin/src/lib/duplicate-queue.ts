// @ts-nocheck - merge helpers are typed loosely in @neram/database
/**
 * Server helpers for the Duplicates queue (/duplicates).
 *
 * A candidate pair can be any shape (two Google rows, a phone-only "User" row
 * and a Google row, an org row and a Gmail row). The older alumni merge route
 * re-detects one specific shape, so the queue has its own preview and merge
 * that work from the pair itself, with the same safety rules.
 */
import {
  getSupabaseAdminClient,
  getDuplicateCandidate,
  buildMergePreview,
  previewUserMergeCounts,
  chooseSurvivorOrder,
} from '@neram/database';

const MERGE_ROW_COLS =
  'id, name, email, personal_email, ms_oid, firebase_uid, google_id, phone, date_of_birth, academic_year, is_alumni, created_at, avatar_url, user_type';

export class QueueError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function total(counts: Array<{ rows: number }>): number {
  return counts.reduce((s, c) => s + (c.rows || 0), 0);
}

/** The pair, who survives, what moves, and why a merge would be refused. */
export async function buildCandidatePreview(candidateId: string) {
  const supabase = getSupabaseAdminClient();
  const candidate = await getDuplicateCandidate(candidateId, supabase);
  if (!candidate) throw new QueueError('This duplicate is no longer in the queue.', 404);

  const { data: rows, error } = await supabase
    .from('users')
    .select(MERGE_ROW_COLS)
    .in('id', [candidate.user_a, candidate.user_b]);
  if (error) throw error;
  const x = rows?.find((r) => r.id === candidate.user_a);
  const y = rows?.find((r) => r.id === candidate.user_b);
  if (!x || !y) throw new QueueError('One of these records no longer exists.', 409);

  const [countsX, countsY] = await Promise.all([
    previewUserMergeCounts(x.id, supabase).catch(() => []),
    previewUserMergeCounts(y.id, supabase).catch(() => []),
  ]);
  const [first, second] = chooseSurvivorOrder(x, y, { [x.id]: total(countsX), [y.id]: total(countsY) });
  const preview = buildMergePreview(first, second);
  const referenceCounts = preview.loser.id === x.id ? countsX : countsY;

  const refused =
    !!preview.winner.ms_oid && !!preview.loser.ms_oid && preview.winner.ms_oid !== preview.loser.ms_oid;

  return {
    candidate,
    winnerId: preview.winner.id,
    loserId: preview.loser.id,
    preview: { ...preview, referenceCounts },
    refused,
  };
}

/** Merge the pair. Re-derives the survivor server-side; never trusts the client. */
export async function mergeCandidate(candidateId: string, adminId: string, expectedLoserId?: string) {
  const { candidate, winnerId, loserId, refused } = await buildCandidatePreview(candidateId);
  if (candidate.status !== 'open') throw new QueueError('This duplicate was already resolved.', 409);
  if (refused) {
    throw new QueueError(
      'The two records have different Microsoft accounts. They are two people, not a duplicate. Merge refused.',
      409,
    );
  }
  if (expectedLoserId && expectedLoserId !== loserId) {
    throw new QueueError('The records changed since you reviewed them. Reopen the pair and try again.', 409);
  }
  const { mergeUserRecords } = await import('@neram/database');
  const summary = await mergeUserRecords(winnerId, loserId, adminId);
  return { winnerId, loserId, summary };
}
