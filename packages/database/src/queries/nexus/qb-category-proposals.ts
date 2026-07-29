// @ts-nocheck — nexus_qb_category_proposals and the
// nexus_qb_apply_category_proposals RPC are not yet in the generated Supabase
// types. Regenerate with pnpm supabase:gen:types after 20260801091000.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

const PROPOSALS = 'nexus_qb_category_proposals';

export type QBProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'stale';

export interface NexusQBCategoryProposal {
  id: string;
  run_id: string;
  question_id: string;
  current_categories: string[];
  proposed_add: string[];
  proposed_remove: string[];
  source: 'keyword' | 'ai' | 'manual';
  confidence: number | null;
  rationale: string | null;
  status: QBProposalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  created_at: string;
}

export interface QBProposalWithQuestion extends NexusQBCategoryProposal {
  question_text: string | null;
  question_image_url: string | null;
}

/**
 * A page of proposals joined to their question text, for the review UI.
 *
 * The join is done in two queries rather than a PostgREST embed because the
 * proposals table has no declared relationship name in the generated types yet.
 */
export async function getQBCategoryProposals(
  opts: { status?: QBProposalStatus; page?: number; pageSize?: number } = {},
  client?: TypedSupabaseClient,
): Promise<{ proposals: QBProposalWithQuestion[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from(PROPOSALS)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(from, from + pageSize - 1);
  if (opts.status) query = query.eq('status', opts.status);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data || []) as NexusQBCategoryProposal[];
  if (rows.length === 0) return { proposals: [], total: count || 0 };

  const { data: questions, error: qError } = await supabase
    .from('nexus_qb_questions')
    .select('id, question_text, question_image_url')
    .in('id', [...new Set(rows.map((r) => r.question_id))]);
  if (qError) throw qError;

  const byId = new Map((questions || []).map((q: any) => [q.id, q]));
  return {
    proposals: rows.map((r) => ({
      ...r,
      question_text: byId.get(r.question_id)?.question_text ?? null,
      question_image_url: byId.get(r.question_id)?.question_image_url ?? null,
    })),
    total: count || 0,
  };
}

/** Mark proposals approved or rejected without touching any question. */
export async function setQBProposalStatus(
  ids: string[],
  status: Extract<QBProposalStatus, 'approved' | 'rejected'>,
  reviewerId: string | null,
  client?: TypedSupabaseClient,
): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PROPOSALS)
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .in('id', ids)
    .in('status', ['pending', 'approved', 'rejected'])
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

/**
 * Commit proposals to the live bank.
 *
 * Delegates to the nexus_qb_apply_category_proposals RPC so that categories[]
 * and nexus_qb_question_tags are written in one transaction. Doing it from here
 * with separate PostgREST calls would leave the two out of sync on a partial
 * failure, and nothing in the database repairs that.
 *
 * `stale` counts proposals skipped because the question changed after the
 * proposal was generated.
 */
export async function applyQBCategoryProposals(
  ids: string[],
  reviewerId: string | null,
  client?: TypedSupabaseClient,
): Promise<{ applied: number; stale: number }> {
  if (ids.length === 0) return { applied: 0, stale: 0 };
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('nexus_qb_apply_category_proposals', {
    p_ids: ids,
    p_reviewer: reviewerId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { applied: Number(row?.applied) || 0, stale: Number(row?.stale) || 0 };
}

/** Counts per status, for the review page header. */
export async function getQBProposalSummary(
  client?: TypedSupabaseClient,
): Promise<Record<QBProposalStatus, number>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(PROPOSALS).select('status').range(0, 99999);
  if (error) throw error;
  const out: Record<string, number> = { pending: 0, approved: 0, rejected: 0, applied: 0, stale: 0 };
  for (const row of data || []) out[(row as any).status] = (out[(row as any).status] || 0) + 1;
  return out as Record<QBProposalStatus, number>;
}
