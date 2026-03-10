// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Diagnostics Queries
 *
 * Device sessions, location tracking, and error logging
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { UserDeviceSession, UserDeviceSessionInsert, UserErrorLog, UserErrorLogInsert } from '../types';

/**
 * Insert a new device session
 */
export async function insertDeviceSession(
  client: TypedSupabaseClient,
  data: UserDeviceSessionInsert
): Promise<UserDeviceSession | null> {
  const { data: session, error } = await client
    .from('user_device_sessions')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('Failed to insert device session:', error);
    return null;
  }
  return session;
}

/**
 * Update last_active on an existing session
 */
export async function updateSessionLastActive(
  client: TypedSupabaseClient,
  sessionId: string
): Promise<void> {
  await client
    .from('user_device_sessions')
    .update({ last_active: new Date().toISOString() })
    .eq('id', sessionId);
}

/**
 * Insert an error log
 */
export async function insertErrorLog(
  client: TypedSupabaseClient,
  data: UserErrorLogInsert
): Promise<UserErrorLog | null> {
  const { data: log, error } = await client
    .from('user_error_logs')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('Failed to insert error log:', error);
    return null;
  }
  return log;
}

// ============================================
// ADMIN QUERIES (for admin panel)
// ============================================

/**
 * Get all device sessions for a user (admin)
 */
export async function getDeviceSessionsForUser(
  userId: string,
  limit = 50
): Promise<UserDeviceSession[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_device_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get device sessions:', error);
    return [];
  }
  return data || [];
}

/**
 * Get latest device session for a user (admin)
 */
export async function getLatestDeviceSession(
  userId: string
): Promise<UserDeviceSession | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_device_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * Get error logs for a user (admin)
 */
export async function getErrorLogsForUser(
  userId: string,
  limit = 100
): Promise<UserErrorLog[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_error_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get error logs:', error);
    return [];
  }
  return data || [];
}
