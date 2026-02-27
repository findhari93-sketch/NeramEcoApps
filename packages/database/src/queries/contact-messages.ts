/**
 * Contact Messages Queries
 *
 * CRUD operations for contact form submissions.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import type { ContactMessage } from '../types';

export interface CreateContactMessageInput {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  center_id?: string;
  source?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface ContactMessageFilters {
  status?: 'unread' | 'read' | 'replied';
  center_id?: string;
  page?: number;
  limit?: number;
}

/**
 * Create a new contact message
 */
export async function createContactMessage(
  input: CreateContactMessageInput,
  client?: TypedSupabaseClient
): Promise<ContactMessage> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('contact_messages')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      subject: input.subject,
      message: input.message,
      center_id: input.center_id || null,
      source: input.source || 'contact_page',
      status: 'unread',
      ip_address: input.ip_address || null,
      user_agent: input.user_agent || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ContactMessage;
}

/**
 * Get contact messages with optional filters and pagination
 */
export async function getContactMessages(
  filters: ContactMessageFilters = {},
  client?: TypedSupabaseClient
): Promise<{ data: ContactMessage[]; total: number }> {
  const supabase = client ?? getSupabaseAdminClient();
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('contact_messages')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.center_id) {
    query = query.eq('center_id', filters.center_id);
  }

  const { data, error, count } = await query;

  if (error) throw error;
  return { data: (data ?? []) as ContactMessage[], total: count ?? 0 };
}

/**
 * Get count of unread contact messages
 */
export async function getUnreadContactMessageCount(
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = client ?? getSupabaseAdminClient();

  const { count, error } = await supabase
    .from('contact_messages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'unread');

  if (error) throw error;
  return count ?? 0;
}

/**
 * Mark a contact message as read
 */
export async function markContactMessageAsRead(
  id: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();

  const { error } = await supabase
    .from('contact_messages')
    .update({ status: 'read' })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Mark a contact message as replied
 */
export async function markContactMessageAsReplied(
  id: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();

  const { error } = await supabase
    .from('contact_messages')
    .update({
      status: 'replied',
      replied_by: adminId,
      replied_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}
