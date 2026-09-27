// @ts-nocheck - crm views are newer than the generated Database type
/**
 * CRM follow-ups, owners and conversion (lifecycle plan M5).
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import { recordUserHistory } from './crm';

export type FollowUpRange = 'overdue' | 'today' | 'week' | 'all';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** [start, end) of "today" in India time, as UTC instants. */
export function istDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Open callbacks by due time. `owner` filters on the call's assignee or the person's owner. */
export async function listFollowUps(
  options: { range?: FollowUpRange; ownerId?: string; limit?: number; now?: Date } = {},
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();
  const { range = 'today', ownerId, limit = 100 } = options;
  const { start, end } = istDayBounds(options.now);

  let query = supabase.from('crm_follow_ups').select('*').order('due_at', { ascending: true }).limit(limit);
  if (range === 'overdue') query = query.lt('due_at', start.toISOString());
  if (range === 'today') query = query.lt('due_at', end.toISOString());
  if (range === 'week') query = query.lt('due_at', new Date(end.getTime() + 6 * 86_400_000).toISOString());
  if (ownerId) query = query.or(`assigned_to.eq.${ownerId},crm_owner_id.eq.${ownerId}`);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  return rows.map((r) => ({ ...r, overdue: new Date(r.due_at) < start }));
}

/** How many follow-ups are due today or overdue (for a nav badge). */
export async function countDueFollowUps(client?: TypedSupabaseClient, now?: Date): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { end } = istDayBounds(now);
  const { count, error } = await supabase
    .from('crm_follow_ups')
    .select('callback_id', { count: 'exact', head: true })
    .lt('due_at', end.toISOString());
  if (error) return 0;
  return count ?? 0;
}

/** Staff who can own a person. */
export async function listCrmOwners(client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, avatar_url')
    .in('user_type', ['admin', 'teacher'])
    .eq('is_disabled', false)
    .order('name');
  if (error) throw error;
  return data || [];
}

/** Assign (or clear, with null) the person's owner. Audited. */
export async function setCrmOwner(
  userId: string,
  ownerId: string | null,
  adminId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { data: before } = await supabase.from('users').select('crm_owner_id').eq('id', userId).maybeSingle();
  if (ownerId) {
    const { data: owner } = await supabase.from('users').select('id, user_type').eq('id', ownerId).maybeSingle();
    if (!owner || !['admin', 'teacher'].includes(owner.user_type)) {
      throw new Error('The owner must be a staff member.');
    }
  }
  const { error } = await supabase
    .from('users')
    .update({ crm_owner_id: ownerId, crm_owner_assigned_at: ownerId ? new Date().toISOString() : null })
    .eq('id', userId);
  if (error) throw error;
  await recordUserHistory(supabase, userId, 'crm_owner_id', before?.crm_owner_id ?? null, ownerId, adminId);
}

/** Signups per month and how far they got, newest month first. */
export async function getConversionMonthly(months = 6, client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('crm_conversion_monthly')
    .select('*')
    .order('signup_month', { ascending: false })
    .limit(months);
  if (error) throw error;
  return (data || []).map((r) => ({
    ...r,
    leadRate: r.signed_up ? Math.round((r.became_lead / r.signed_up) * 100) : 0,
    applyRate: r.signed_up ? Math.round((r.applied / r.signed_up) * 100) : 0,
    enrollRate: r.signed_up ? Math.round((r.enrolled / r.signed_up) * 100) : 0,
  }));
}
