/**
 * Service-role reads and writes for the assistant tables. Thin on purpose:
 * no policy here, the callers (turn.ts, actions.ts) decide who may do what.
 * `supabase` is the untyped admin client (tables are not in the generated types).
 */
import type { Channel, Envelope, Mode } from './types';

export interface ThreadRow {
  id: string;
  user_id: string;
  channel: Channel;
  external_id: string | null;
  title: string | null;
  page_context: Record<string, unknown> | null;
  flow_state: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  text: string;
  mode: Mode | null;
  llm: boolean;
  envelope: Envelope | null;
  external_id: string | null;
  created_at: string;
}

export interface ActionRow {
  id: string;
  thread_id: string | null;
  user_id: string;
  kind: string;
  args: Record<string, unknown>;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  confirm_token: string;
  status: 'pending' | 'executing' | 'executed' | 'failed' | 'cancelled' | 'expired';
  result: Record<string, unknown> | null;
  expires_at: string;
  created_at: string;
  executed_at: string | null;
}

export interface ReminderRow {
  id: string;
  user_id: string;
  thread_id: string | null;
  due_on: string;
  text: string;
  kind: string;
  status: 'queued' | 'sent' | 'cancelled';
  sent_at: string | null;
  sent_via: string | null;
  created_at: string;
}

const THREADS = 'nexus_assistant_threads';
const MESSAGES = 'nexus_assistant_messages';
const ACTIONS = 'nexus_assistant_actions';
const REMINDERS = 'nexus_assistant_reminders';

function throwIf(error: unknown): void {
  if (error) throw Object.assign(new Error((error as { message?: string }).message || 'Database error'), { cause: error });
}

export async function createThread(
  supabase: any,
  input: { userId: string; channel: Channel; externalId?: string | null; pageContext?: Record<string, unknown> | null },
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from(THREADS)
    .insert({
      user_id: input.userId,
      channel: input.channel,
      external_id: input.externalId ?? null,
      page_context: input.pageContext ?? null,
      flow_state: null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  throwIf(error);
  return data as ThreadRow;
}

export async function getThread(supabase: any, id: string): Promise<ThreadRow | null> {
  const { data, error } = await supabase.from(THREADS).select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as ThreadRow) ?? null;
}

export async function findThreadByExternalId(
  supabase: any,
  userId: string,
  channel: Channel,
  externalId: string | null,
): Promise<ThreadRow | null> {
  if (!externalId) return null;
  const { data, error } = await supabase
    .from(THREADS)
    .select('*')
    .eq('user_id', userId)
    .eq('channel', channel)
    .eq('external_id', externalId)
    .maybeSingle();
  throwIf(error);
  return (data as ThreadRow) ?? null;
}

export async function touchThread(
  supabase: any,
  id: string,
  patch: { flowState?: Record<string, unknown> | null; pageContext?: Record<string, unknown> | null; title?: string | null; lastMessageAt?: string },
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('flowState' in patch) row.flow_state = patch.flowState ?? null;
  if ('pageContext' in patch) row.page_context = patch.pageContext ?? null;
  if ('title' in patch) row.title = patch.title ?? null;
  if (patch.lastMessageAt) row.last_message_at = patch.lastMessageAt;
  const { error } = await supabase.from(THREADS).update(row).eq('id', id);
  throwIf(error);
}

/**
 * Insert one message. `inserted: false` means the same external id was already
 * stored for this thread (a Teams redelivery), and nothing was written.
 */
export async function appendMessage(
  supabase: any,
  input: { threadId: string; role: 'user' | 'assistant'; text: string; externalId?: string | null; envelope?: Envelope | null; mode?: Mode | null; llm?: boolean },
): Promise<{ inserted: boolean; row: MessageRow | null }> {
  const { data, error } = await supabase
    .from(MESSAGES)
    .insert({
      thread_id: input.threadId,
      role: input.role,
      text: input.text,
      external_id: input.externalId ?? null,
      envelope: input.envelope ?? null,
      mode: input.mode ?? null,
      llm: input.llm ?? false,
    })
    .select('*')
    .single();
  if (error && (error as { code?: string }).code === '23505') return { inserted: false, row: null };
  throwIf(error);
  return { inserted: true, row: data as MessageRow };
}

/** The most recent `limit` messages of a thread, oldest first (as a chat reads). */
export async function listMessages(supabase: any, threadId: string, limit = 30): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from(MESSAGES)
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  throwIf(error);
  return ((data || []) as MessageRow[]).reverse();
}

/**
 * The assistant reply stored for one inbound external id (a Teams activity):
 * the first assistant message after that user message in the same thread.
 * Null when the user message is unknown or its first attempt never replied.
 */
export async function findReplyToExternalId(supabase: any, threadId: string, externalId: string): Promise<MessageRow | null> {
  const { data: asked, error } = await supabase
    .from(MESSAGES)
    .select('id, created_at')
    .eq('thread_id', threadId)
    .eq('external_id', externalId)
    .eq('role', 'user')
    .maybeSingle();
  throwIf(error);
  if (!asked) return null;
  const { data: reply, error: replyError } = await supabase
    .from(MESSAGES)
    .select('*')
    .eq('thread_id', threadId)
    .eq('role', 'assistant')
    .gt('created_at', asked.created_at)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  throwIf(replyError);
  return (reply as MessageRow) ?? null;
}

export async function createAction(
  supabase: any,
  input: {
    threadId: string | null; userId: string; kind: string; args: Record<string, unknown>; summary: string;
    fields: Array<{ label: string; value: string }>; confirmToken: string; expiresAt: string;
  },
): Promise<ActionRow> {
  const { data, error } = await supabase
    .from(ACTIONS)
    .insert({
      thread_id: input.threadId,
      user_id: input.userId,
      kind: input.kind,
      args: input.args,
      summary: input.summary,
      fields: input.fields,
      confirm_token: input.confirmToken,
      status: 'pending',
      expires_at: input.expiresAt,
    })
    .select('*')
    .single();
  throwIf(error);
  return data as ActionRow;
}

export async function getAction(supabase: any, id: string): Promise<ActionRow | null> {
  const { data, error } = await supabase.from(ACTIONS).select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as ActionRow) ?? null;
}

export async function updateAction(
  supabase: any,
  id: string,
  patch: Partial<Pick<ActionRow, 'status' | 'result' | 'executed_at'>>,
): Promise<void> {
  const { error } = await supabase.from(ACTIONS).update(patch).eq('id', id);
  throwIf(error);
}

/**
 * Move one action from pending to executing, only if it is still pending.
 * True when this caller won the claim; false when another request got there first.
 */
export async function claimPendingAction(supabase: any, id: string): Promise<boolean> {
  const { data, error } = await supabase.from(ACTIONS).update({ status: 'executing' }).eq('id', id).eq('status', 'pending').select('id');
  throwIf(error);
  return Array.isArray(data) && data.length > 0;
}

export async function createReminder(
  supabase: any,
  input: { userId: string; threadId: string | null; dueOn: string; text: string; kind: string },
): Promise<ReminderRow> {
  const { data, error } = await supabase
    .from(REMINDERS)
    .insert({ user_id: input.userId, thread_id: input.threadId, due_on: input.dueOn, text: input.text, kind: input.kind, status: 'queued' })
    .select('*')
    .single();
  throwIf(error);
  return data as ReminderRow;
}

/** Queued reminders due on or before `today` (YYYY-MM-DD), oldest first. */
export async function listRemindersDue(supabase: any, userId: string, today: string): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from(REMINDERS)
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'queued')
    .lte('due_on', today)
    .order('due_on', { ascending: true });
  throwIf(error);
  return (data || []) as ReminderRow[];
}
