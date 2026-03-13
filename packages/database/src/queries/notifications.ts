// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Notification Queries
 *
 * Database queries for notification recipients and admin notifications
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  NotificationRecipient,
  NotificationRecipientRole,
  NotificationPreferences,
  AdminNotification,
  NotificationEventType,
} from '../types';

// ============================================
// NOTIFICATION RECIPIENT QUERIES
// ============================================

/**
 * Get active notification recipients for a specific event type
 */
export async function getActiveRecipientsForEvent(
  eventType: NotificationEventType,
  client?: TypedSupabaseClient
): Promise<NotificationRecipient[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('notification_recipients')
    .select('*')
    .eq('is_active', true);

  if (error) throw error;

  // Filter by notification preference for this event type
  return (data || []).filter(recipient => {
    const prefs = recipient.notification_preferences as NotificationPreferences;
    return prefs[eventType as keyof NotificationPreferences] === true;
  });
}

/**
 * List all notification recipients (admin)
 */
export async function listNotificationRecipients(
  options: { isActive?: boolean } = {},
  client?: TypedSupabaseClient
): Promise<NotificationRecipient[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('notification_recipients')
    .select('*');

  if (options.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * Get notification recipient by ID
 */
export async function getNotificationRecipientById(
  recipientId: string,
  client?: TypedSupabaseClient
): Promise<NotificationRecipient | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('notification_recipients')
    .select('*')
    .eq('id', recipientId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Create notification recipient (admin)
 */
export async function createNotificationRecipient(
  recipientData: {
    email: string;
    name: string;
    role?: NotificationRecipientRole;
    notification_preferences?: Partial<NotificationPreferences>;
    added_by?: string;
  },
  client?: TypedSupabaseClient
): Promise<NotificationRecipient> {
  const supabase = client || getSupabaseAdminClient();

  const defaultPrefs: NotificationPreferences = {
    new_onboarding: true,
    onboarding_skipped: false,
    new_application: true,
    payment_received: true,
    demo_registration: true,
    new_callback: true,
    daily_summary: true,
    scholarship_opened: true,
    scholarship_submitted: true,
    scholarship_approved: true,
    scholarship_rejected: true,
    scholarship_revision_requested: true,
    application_approved: true,
    refund_requested: true,
    refund_approved: true,
    refund_rejected: true,
    contact_message_received: true,
    question_submitted: true,
    question_edit_requested: true,
    question_delete_requested: true,
    callback_reminder: true,
    direct_enrollment_completed: true,
    ticket_created: true,
    ticket_resolved: false,
    link_regeneration_requested: true,
  };

  const { data, error } = await (supabase as any)
    .from('notification_recipients')
    .insert({
      email: recipientData.email,
      name: recipientData.name,
      role: recipientData.role || 'team_member',
      notification_preferences: {
        ...defaultPrefs,
        ...recipientData.notification_preferences,
      },
      is_active: true,
      added_by: recipientData.added_by || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as NotificationRecipient;
}

/**
 * Update notification recipient (admin)
 */
export async function updateNotificationRecipient(
  recipientId: string,
  updates: Partial<Omit<NotificationRecipient, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<NotificationRecipient> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('notification_recipients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', recipientId)
    .select()
    .single();

  if (error) throw error;
  return data as NotificationRecipient;
}

/**
 * Deactivate notification recipient (soft delete)
 */
export async function deactivateNotificationRecipient(
  recipientId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('notification_recipients')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', recipientId);

  if (error) throw error;
}

// ============================================
// ADMIN NOTIFICATION QUERIES
// ============================================

/**
 * Create admin in-app notification
 */
export async function createAdminNotification(
  notification: {
    event_type: NotificationEventType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  },
  client?: TypedSupabaseClient
): Promise<AdminNotification> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('admin_notifications')
    .insert({
      event_type: notification.event_type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata || null,
      is_read: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AdminNotification;
}

/**
 * Get unread admin notification count
 */
export async function getUnreadNotificationCount(
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();

  const { count, error } = await supabase
    .from('admin_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) throw error;
  return count || 0;
}

/**
 * List admin notifications (paginated)
 */
export async function listAdminNotifications(
  options: {
    isRead?: boolean;
    eventType?: NotificationEventType;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ notifications: AdminNotification[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { isRead, eventType, limit = 20, offset = 0 } = options;

  // Use separate count query (head:true) to avoid incorrect count
  // when .range() is combined with count:'exact' through Cloudflare proxy
  let countQuery = supabase
    .from('admin_notifications')
    .select('*', { count: 'exact', head: true });

  let dataQuery = supabase
    .from('admin_notifications')
    .select('*');

  if (isRead !== undefined) {
    countQuery = countQuery.eq('is_read', isRead);
    dataQuery = dataQuery.eq('is_read', isRead);
  }

  if (eventType) {
    countQuery = countQuery.eq('event_type', eventType);
    dataQuery = dataQuery.eq('event_type', eventType);
  }

  dataQuery = dataQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

  if (countResult.error) throw countResult.error;
  if (dataResult.error) throw dataResult.error;

  return {
    notifications: dataResult.data || [],
    count: countResult.count || 0,
  };
}

/**
 * Mark a single notification as read
 */
export async function markNotificationRead(
  notificationId: string,
  readByUserId: string | null,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const updateData: Record<string, unknown> = {
    is_read: true,
    read_at: new Date().toISOString(),
  };
  if (readByUserId) {
    updateData.read_by = readByUserId;
  }

  const { error } = await (supabase as any)
    .from('admin_notifications')
    .update(updateData)
    .eq('id', notificationId);

  if (error) throw error;
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(
  readByUserId: string | null,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const updateData: Record<string, unknown> = {
    is_read: true,
    read_at: new Date().toISOString(),
  };
  if (readByUserId) {
    updateData.read_by = readByUserId;
  }

  const { error } = await (supabase as any)
    .from('admin_notifications')
    .update(updateData)
    .eq('is_read', false);

  if (error) throw error;
}
