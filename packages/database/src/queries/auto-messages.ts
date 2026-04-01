// @ts-nocheck
/**
 * Auto Messages Queries
 *
 * CRUD operations for automated first-touch WhatsApp/email messages.
 * Used by the cron job, registration trigger, and CRM detail view.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import type { AutoMessage, AutoMessageInsert } from '../types';

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
