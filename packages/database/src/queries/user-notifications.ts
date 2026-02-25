// @ts-nocheck
/**
 * Neram Classes - User Notification Queries
 *
 * Database queries for per-user in-app notifications (student bell icon).
 * Both apps/app and apps/marketing share these queries via the same DB table.
 */

import { getSupabaseAdminClient } from '../client';
import type { UserNotification, NotificationEventType } from '../types';

// ============================================
// CREATE
// ============================================

/**
 * Create a user notification (called from dispatcher, server-side only).
 * Uses admin client to bypass RLS for system inserts.
 */
export async function createUserNotification(
  notification: {
    user_id: string;
    event_type: NotificationEventType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  },
  client?: any
): Promise<UserNotification> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('user_notifications')
    .insert({
      user_id: notification.user_id,
      event_type: notification.event_type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata || null,
      is_read: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data as UserNotification;
}

// ============================================
// READ
// ============================================

/**
 * Get unread notification count for a user.
 * This is the polling endpoint called every 30 seconds.
 */
export async function getUserUnreadNotificationCount(
  userId: string,
  client?: any
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();

  const { count, error } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return count || 0;
}

/**
 * List user notifications (paginated, newest first).
 * Called when bell icon is clicked to show the dropdown.
 */
export async function listUserNotifications(
  userId: string,
  options: {
    isRead?: boolean;
    limit?: number;
    offset?: number;
  } = {},
  client?: any
): Promise<{ notifications: UserNotification[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { isRead, limit = 20, offset = 0 } = options;

  let query = supabase
    .from('user_notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  if (isRead !== undefined) {
    query = query.eq('is_read', isRead);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    notifications: (data || []) as UserNotification[],
    count: count || 0,
  };
}

// ============================================
// UPDATE (mark as read)
// ============================================

/**
 * Mark a single notification as read.
 * Verifies user_id ownership for security.
 */
export async function markUserNotificationRead(
  notificationId: string,
  userId: string,
  client?: any
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('user_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllUserNotificationsRead(
  userId: string,
  client?: any
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('user_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}
