// @ts-nocheck
/**
 * Auto Messages Queries
 *
 * CRUD operations for automated first-touch WhatsApp/email messages.
 * Used by the cron job, registration trigger, and CRM detail view.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import type { AutoMessage, AutoMessageInsert, FIRST_TOUCH_TEMPLATES } from '../types';

/**
 * Insert a pending auto message (e.g., first-touch after registration).
 * Uses ON CONFLICT DO NOTHING to prevent duplicates on re-login.
 */
export async function createAutoMessage(
  data: AutoMessageInsert,
  client?: TypedSupabaseClient
): Promise<AutoMessage | null> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data: record, error } = await supabase
    .from('auto_messages')
    .upsert(
      {
        user_id: data.user_id,
        message_type: data.message_type ?? 'first_touch',
        channel: data.channel,
        template_name: data.template_name,
        send_after: data.send_after,
        metadata: data.metadata ?? {},
      },
      {
        onConflict: 'user_id,message_type,channel',
        ignoreDuplicates: true,
      }
    )
    .select()
    .single();

  if (error && error.code !== '23505') throw error; // ignore unique violation
  return (record as AutoMessage) ?? null;
}

/**
 * Get pending messages that are ready to send (send_after <= now).
 * Joins with users table to get phone/email/name.
 */
export async function getPendingAutoMessages(
  client?: TypedSupabaseClient
): Promise<(AutoMessage & { user_name: string | null; user_phone: string | null; user_email: string | null })[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('auto_messages')
    .select(`
      *,
      users!inner(name, phone, email)
    `)
    .eq('delivery_status', 'pending')
    .lte('send_after', new Date().toISOString())
    .order('send_after', { ascending: true })
    .limit(50); // Process max 50 per cron run to avoid timeouts

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    user_name: row.users?.name ?? null,
    user_phone: row.users?.phone ?? null,
    user_email: row.users?.email ?? null,
    users: undefined,
  }));
}

/**
 * Get failed messages eligible for retry (retry_count < maxRetries, within 24h).
 *
 * Excludes rows whose `error_message` was tagged by `formatWhatsAppError()` as
 * a permanent failure (WA_DEV_MODE, WA_TEMPLATE_PARAM_MISMATCH, WA_UNDELIVERABLE).
 * Those won't fix themselves by retrying, so the cron skips them and waits for
 * an admin to click Retry in the CRM after fixing the root cause.
 */
export async function getFailedAutoMessages(
  maxRetries: number = 3,
  client?: TypedSupabaseClient
): Promise<(AutoMessage & { user_name: string | null; user_phone: string | null; user_email: string | null })[]> {
  const supabase = client ?? getSupabaseAdminClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('auto_messages')
    .select(`
      *,
      users!inner(name, phone, email)
    `)
    .eq('delivery_status', 'failed')
    .lt('retry_count', maxRetries)
    .gte('created_at', oneDayAgo)
    .not('error_message', 'ilike', 'WA_DEV_MODE%')
    .not('error_message', 'ilike', 'WA_TEMPLATE_PARAM_MISMATCH%')
    .not('error_message', 'ilike', 'WA_UNDELIVERABLE%')
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    user_name: row.users?.name ?? null,
    user_phone: row.users?.phone ?? null,
    user_email: row.users?.email ?? null,
    users: undefined,
  }));
}

/**
 * Update the delivery result after a send attempt.
 */
export async function updateAutoMessageResult(
  id: string,
  result: {
    success: boolean;
    externalMessageId?: string;
    error?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();

  const updateData: Record<string, unknown> = {
    delivery_status: result.success ? 'sent' : 'failed',
    external_message_id: result.externalMessageId ?? null,
    error_message: result.error ?? null,
  };

  if (result.success) {
    updateData.sent_at = new Date().toISOString();
  }

  // Increment retry_count on failure
  if (!result.success) {
    const { data: current } = await supabase
      .from('auto_messages')
      .select('retry_count')
      .eq('id', id)
      .single();

    updateData.retry_count = ((current as any)?.retry_count ?? 0) + 1;
  }

  const { error } = await supabase
    .from('auto_messages')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;
}

/**
 * Get all auto messages for a specific user (CRM detail view).
 */
export async function getAutoMessagesForUser(
  userId: string,
  client?: TypedSupabaseClient
): Promise<AutoMessage[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('auto_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AutoMessage[];
}

/**
 * Get auto-message stats for dashboard.
 */
export async function getAutoMessageStats(
  dateFrom?: string,
  dateTo?: string,
  client?: TypedSupabaseClient
): Promise<{ total: number; sent: number; delivered: number; read: number; failed: number; pending: number }> {
  const supabase = client ?? getSupabaseAdminClient();

  let query = supabase
    .from('auto_messages')
    .select('delivery_status');

  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  return {
    total: rows.length,
    sent: rows.filter((r: any) => r.delivery_status === 'sent').length,
    delivered: rows.filter((r: any) => r.delivery_status === 'delivered').length,
    read: rows.filter((r: any) => r.delivery_status === 'read').length,
    failed: rows.filter((r: any) => r.delivery_status === 'failed').length,
    pending: rows.filter((r: any) => r.delivery_status === 'pending').length,
  };
}

/**
 * Get active leads who don't have a first_touch auto_message yet.
 * Used by the backfill endpoint to send first-touch to existing leads.
 * Includes state from lead_profiles for template selection (TN = video, others = text).
 */
export async function getLeadsWithoutFirstTouch(
  client?: TypedSupabaseClient
): Promise<{ id: string; name: string | null; phone: string | null; email: string | null; state: string | null }[]> {
  const supabase = client ?? getSupabaseAdminClient();

  // Get all active leads with firebase_uid (app users)
  // LEFT JOIN lead_profiles for state info
  // Exclude those already in auto_messages with first_touch
  const { data, error } = await (supabase as any).rpc('get_leads_without_first_touch');

  if (error) {
    // Fallback: manual query if RPC doesn't exist
    // Query leads not in auto_messages
    const { data: leads, error: leadError } = await supabase
      .from('users')
      .select('id, name, phone, email')
      .eq('user_type', 'lead')
      .eq('status', 'active')
      .not('firebase_uid', 'is', null);

    if (leadError) throw leadError;

    // Get user IDs that already have first_touch
    const { data: existing } = await supabase
      .from('auto_messages')
      .select('user_id')
      .eq('message_type', 'first_touch');

    const existingIds = new Set((existing ?? []).map((e: any) => e.user_id));

    // Get state from lead_profiles
    const userIds = (leads ?? []).filter((l: any) => !existingIds.has(l.id)).map((l: any) => l.id);
    const { data: profiles } = await supabase
      .from('lead_profiles')
      .select('user_id, state')
      .in('user_id', userIds.length > 0 ? userIds : ['__none__']);

    const stateMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.state]));

    return (leads ?? [])
      .filter((l: any) => !existingIds.has(l.id))
      .map((l: any) => ({
        ...l,
        state: stateMap.get(l.id) ?? null,
      }));
  }

  return data ?? [];
}

/**
 * Schedule the 5-email phone verification drip sequence for a new lead.
 * Called after user registration when phone_verified = false.
 * Uses ON CONFLICT DO NOTHING — safe to call multiple times.
 *
 * @param anchorMs - Optional epoch ms to use as the scheduling anchor.
 *   Default: Date.now(). For backfill, pass Date.now() - 25*60*1000 so
 *   Email 1 goes out in ~5 minutes instead of 30.
 */
export async function schedulePhoneDrip(
  userId: string,
  meta: { userName: string | null; email: string | null },
  client?: TypedSupabaseClient,
  anchorMs?: number
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();

  const drip: Array<{ type: string; delayMinutes: number }> = [
    { type: 'phone_drip_1', delayMinutes: 30 },
    { type: 'phone_drip_2', delayMinutes: 60 * 24 * 2 },
    { type: 'phone_drip_3', delayMinutes: 60 * 24 * 4 },
    { type: 'phone_drip_4', delayMinutes: 60 * 24 * 7 },
    { type: 'phone_drip_5', delayMinutes: 60 * 24 * 14 },
  ];

  const now = anchorMs ?? Date.now();

  for (const step of drip) {
    const sendAfter = new Date(now + step.delayMinutes * 60 * 1000).toISOString();
    try {
      await createAutoMessage({
        user_id: userId,
        message_type: step.type as any,
        channel: 'email',
        template_name: step.type,
        send_after: sendAfter,
        metadata: {
          user_name: meta.userName,
          email: meta.email,
          source: 'registration',
        },
      }, supabase);
    } catch (err: any) {
      // Skip duplicate (unique constraint on user_id, message_type, channel)
      if (err?.code !== '23505') {
        console.error(`Failed to schedule ${step.type} for user ${userId}:`, err);
      }
    }
  }
}

/**
 * Cancel all pending phone_drip_* messages for a user.
 * Called when user unsubscribes via the unsubscribe link.
 */
export async function cancelPendingPhoneDrip(
  userId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();

  const { error } = await supabase
    .from('auto_messages')
    .update({ delivery_status: 'failed', error_message: 'unsubscribed' })
    .eq('user_id', userId)
    .eq('delivery_status', 'pending')
    .like('message_type', 'phone_drip_%');

  if (error) throw error;
}
