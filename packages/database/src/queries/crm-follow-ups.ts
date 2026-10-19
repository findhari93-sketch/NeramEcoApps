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
  options: { range?: FollowUpRange; ownerId?: string; type?: 'demo' | 'callback' | 'all'; limit?: number; now?: Date } = {},
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
  if (options.type === 'demo') query = query.in('query_type', ['post_demo', 'demo_rebook']);
  if (options.type === 'callback') query = query.or('query_type.is.null,query_type.not.in.(post_demo,demo_rebook)');

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

// ---------------------------------------------------------------------------
// Stale follow-ups close by themselves (2026-10-19). The rules live in SQL
// (follow_up_expiry_candidates / run_follow_up_expiry): already a student,
// earlier exam season, archived, counselling request 60+ days old, or no
// account after 30 days. Rows become status 'expired', never deleted.

export type FollowUpCloseReason = 'already_student' | 'earlier_season' | 'archived' | 'counselling_over' | 'no_account_stale';

export const FOLLOW_UP_CLOSE_REASON_LABELS: Record<FollowUpCloseReason, string> = {
  already_student: 'Already a student',
  earlier_season: 'Exam season has passed',
  archived: 'Archived on People',
  counselling_over: 'Counselling season is over',
  no_account_stale: 'No account, over 30 days old',
};

export interface FollowUpExpiryCandidate {
  callback_id: string;
  user_id: string | null;
  matched_user_id: string | null;
  name: string | null;
  phone: string | null;
  query_type: string | null;
  created_at: string;
  exam_year: number | null;
  reason: FollowUpCloseReason;
}

export interface FollowUpExpiryRun {
  skipped: boolean;
  linked: number;
  closed: number;
  by_reason: Partial<Record<FollowUpCloseReason, number>>;
}

/** What the next run would close: the total, a count per reason, and the rows (oldest first). */
export async function previewFollowUpExpiry(
  client?: TypedSupabaseClient,
): Promise<{ total: number; linked: number; byReason: Partial<Record<FollowUpCloseReason, number>>; rows: FollowUpExpiryCandidate[] }> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('follow_up_expiry_candidates');
  if (error) throw error;
  const rows = (data || []) as FollowUpExpiryCandidate[];
  const byReason: Partial<Record<FollowUpCloseReason, number>> = {};
  for (const r of rows) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  return { total: rows.length, linked: rows.filter((r) => r.matched_user_id).length, byReason, rows };
}

/** Close them now. Staff runs go ahead even when the nightly job is off. */
export async function runFollowUpExpiryNow(adminId: string, client?: TypedSupabaseClient): Promise<FollowUpExpiryRun> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('run_follow_up_expiry', { p_triggered_by: `staff:${adminId}` });
  if (error) throw error;
  return data as FollowUpExpiryRun;
}

/** Turn the nightly close on or off, keeping the other lifecycle rules. */
export async function setFollowUpExpiryEnabled(enabled: boolean, adminId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'lifecycle_rules').maybeSingle();
  const value = { ...(data?.value || {}), follow_up_expiry_enabled: Boolean(enabled) };
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key: 'lifecycle_rules', value, updated_at: new Date().toISOString(), updated_by: adminId });
  if (error) throw error;
  return Boolean(enabled);
}

export async function getFollowUpExpiryEnabled(client?: TypedSupabaseClient): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'lifecycle_rules').maybeSingle();
  return Boolean(data?.value?.follow_up_expiry_enabled);
}

export interface ClosedFollowUp {
  callback_id: string;
  user_id: string | null;
  person_name: string | null;
  person_phone: string | null;
  query_type: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
  closed_reason: FollowUpCloseReason | null;
}

/** Follow-ups the nightly job closed in the last `days` days, newest first. */
export async function listClosedFollowUps(
  options: { days?: number; limit?: number; type?: 'demo' | 'callback' | 'all' } = {},
  client?: TypedSupabaseClient,
): Promise<ClosedFollowUp[]> {
  const supabase = client || getSupabaseAdminClient();
  const { days = 30, limit = 200 } = options;
  let query = supabase
    .from('callback_requests')
    .select('id, user_id, name, phone, query_type, source, notes, created_at, completed_at, closed_reason')
    .eq('status', 'expired')
    .gte('completed_at', new Date(Date.now() - days * 86_400_000).toISOString())
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (options.type === 'demo') query = query.in('query_type', ['post_demo', 'demo_rebook']);
  if (options.type === 'callback') query = query.or('query_type.is.null,query_type.not.in.(post_demo,demo_rebook)');
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const people = new Map<string, { name: string | null; phone: string | null }>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: users, error: usersErr } = await supabase.from('users').select('id, name, phone').in('id', ids.slice(i, i + 150));
    if (usersErr) throw usersErr;
    for (const u of users || []) people.set(u.id, u);
  }
  return rows.map((r) => {
    const p = r.user_id ? people.get(r.user_id) : undefined;
    const accountName = p?.name && p.name.trim() && p.name.trim() !== 'User' ? p.name : null;
    return {
      callback_id: r.id,
      user_id: r.user_id,
      person_name: accountName || r.name || p?.name || null,
      person_phone: p?.phone || r.phone || null,
      query_type: r.query_type,
      source: r.source,
      notes: r.notes,
      created_at: r.created_at,
      closed_at: r.completed_at,
      closed_reason: r.closed_reason,
    };
  });
}

/** Put a closed follow-up back on the list, due now. The nightly job leaves it alone from then on. */
export async function reopenFollowUp(callbackId: string, client?: TypedSupabaseClient): Promise<{ error?: string }> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('callback_requests')
    .update({
      status: 'pending',
      closed_reason: null,
      // The nightly job skips this marker, so it does not close the row again.
      closed_by: 'staff:reopened',
      completed_at: null,
      scheduled_callback_at: new Date().toISOString(),
    })
    .eq('id', callbackId)
    .eq('status', 'expired')
    .select('id');
  if (error) {
    // One open demo follow-up per person: a newer one is already open.
    if (error.code === '23505') return { error: 'This person already has an open demo follow-up.' };
    throw error;
  }
  if (!data?.length) return { error: 'This follow-up is not closed any more.' };
  return {};
}
