/**
 * Message Replies Queries
 *
 * CRUD operations for contact message replies.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import type { MessageReply, ReplyChannel, ReplyStatus } from '../types';

export interface CreateMessageReplyInput {
  message_id: string;
  channel: ReplyChannel;
  reply_body: string;
  sent_to: string;
  sent_from: string;
  sent_by: string;
  sent_by_name: string;
  status: ReplyStatus;
  error_message?: string;
}

/**
 * Create a message reply log entry
 */
export async function createMessageReply(
  input: CreateMessageReplyInput,
  client?: TypedSupabaseClient
): Promise<MessageReply> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await (supabase
    .from('message_replies') as any)
    .insert({
      message_id: input.message_id,
      channel: input.channel,
      reply_body: input.reply_body,
      sent_to: input.sent_to,
      sent_from: input.sent_from,
      sent_by: input.sent_by,
      sent_by_name: input.sent_by_name,
      status: input.status,
      error_message: input.error_message || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as MessageReply;
}

/**
 * Get all replies for a contact message, newest first
 */
export async function getMessageReplies(
  messageId: string,
  client?: TypedSupabaseClient
): Promise<MessageReply[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('message_replies')
    .select('*')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MessageReply[];
}
