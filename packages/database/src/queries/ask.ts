// @ts-nocheck - Supabase types not generated for the ask_* tables yet
/**
 * Ask aiArchitek: conversations, messages and remembered details for the chat
 * in the Tools app (apps/app/src/app/api/ask). Service role only; the route
 * decides who the caller is (Firebase token or the guest cookie) before any of
 * these run. Schema: supabase/migrations/20261221090000_ask_aiarchitek.sql.
 *
 * An owner is a signed-in student (userId) or a guest (anonId), never both
 * unknown. A guest's rows move to the account on sign-in (claimAskGuestData).
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';

export interface AskOwner {
  userId?: string | null;
  anonId?: string | null;
}

export interface AskThreadRow {
  id: string;
  user_id: string | null;
  anon_id: string | null;
  title: string | null;
  page_context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface AskMessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: unknown[];
  created_at: string;
}

const ownerFilter = (q: any, owner: AskOwner) =>
  owner.userId ? q.eq('user_id', owner.userId) : q.eq('anon_id', owner.anonId).is('user_id', null);

function assertOwner(owner: AskOwner) {
  if (!owner.userId && !owner.anonId) throw new Error('ask: an owner (userId or anonId) is required');
}

/** The thread if it belongs to this owner, otherwise null (never someone else's). */
export async function getAskThread(
  id: string,
  owner: AskOwner,
  client?: TypedSupabaseClient
): Promise<AskThreadRow | null> {
  assertOwner(owner);
  const supabase = client ?? getSupabaseAdminClient();
  const { data, error } = await ownerFilter(supabase.from('ask_threads').select('*').eq('id', id), owner).maybeSingle();
  if (error) throw error;
  return (data as AskThreadRow) ?? null;
}

export async function createAskThread(
  input: AskOwner & { title?: string | null; pageContext?: Record<string, unknown> | null },
  client?: TypedSupabaseClient
): Promise<AskThreadRow> {
  assertOwner(input);
  const supabase = client ?? getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ask_threads')
    .insert({
      user_id: input.userId ?? null,
      anon_id: input.userId ? null : input.anonId ?? null,
      title: input.title ? input.title.slice(0, 120) : null,
      page_context: input.pageContext ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as AskThreadRow;
}

/** Newest threads first, for the history drawer (signed-in students only). */
export async function listAskThreads(
  userId: string,
  limit = 30,
  client?: TypedSupabaseClient
): Promise<Pick<AskThreadRow, 'id' | 'title' | 'last_message_at' | 'created_at'>[]> {
  const supabase = client ?? getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ask_threads')
    .select('id, title, last_message_at, created_at')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listAskMessages(
  threadId: string,
  limit = 60,
  client?: TypedSupabaseClient
): Promise<AskMessageRow[]> {
  const supabase = client ?? getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ask_messages')
    .select('id, thread_id, role, text, cards, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AskMessageRow[];
}

export async function appendAskMessage(
  input: AskOwner & {
    threadId: string;
    role: 'user' | 'assistant';
    text: string;
    cards?: unknown[];
    toolCalls?: unknown[] | null;
    model?: string | null;
    error?: string | null;
    responseMs?: number | null;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from('ask_messages').insert({
    thread_id: input.threadId,
    user_id: input.userId ?? null,
    anon_id: input.userId ? null : input.anonId ?? null,
    role: input.role,
    text: input.text ?? '',
    cards: input.cards ?? [],
    tool_calls: input.toolCalls ?? null,
    model: input.model ?? null,
    error: input.error ?? null,
    response_ms: input.responseMs ?? null,
  });
  if (error) throw error;
  await supabase.from('ask_threads').update({ last_message_at: now, updated_at: now }).eq('id', input.threadId);
}

/**
 * Answers a guest has had since `sinceIso` (the route passes midnight India
 * time). Failed answers (error set) do not count against them.
 */
export async function countAskGuestAnswersSince(
  anonId: string,
  sinceIso: string,
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = client ?? getSupabaseAdminClient();
  const { count, error } = await supabase
    .from('ask_messages')
    .select('id', { count: 'exact', head: true })
    .eq('anon_id', anonId)
    .is('user_id', null)
    .eq('role', 'assistant')
    .is('error', null)
    .gte('created_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

export async function getAskMemory(owner: AskOwner, client?: TypedSupabaseClient): Promise<Record<string, unknown>> {
  assertOwner(owner);
  const supabase = client ?? getSupabaseAdminClient();
  const q = supabase.from('ask_memory').select('facts');
  const { data, error } = await (owner.userId ? q.eq('user_id', owner.userId) : q.eq('anon_id', owner.anonId)).maybeSingle();
  if (error) throw error;
  return (data?.facts as Record<string, unknown>) ?? {};
}

/** Replaces the remembered details. The caller merges and validates first. */
export async function saveAskMemory(
  owner: AskOwner,
  facts: Record<string, unknown>,
  client?: TypedSupabaseClient
): Promise<void> {
  assertOwner(owner);
  const supabase = client ?? getSupabaseAdminClient();
  const row = owner.userId
    ? { user_id: owner.userId, anon_id: null, facts, updated_at: new Date().toISOString() }
    : { anon_id: owner.anonId, user_id: null, facts, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('ask_memory')
    .upsert(row, { onConflict: owner.userId ? 'user_id' : 'anon_id' });
  if (error) throw error;
}

/**
 * A guest signed in: their threads, messages and remembered details become the
 * account's. Details typed as a guest are newer than anything stored on the
 * account, so they win a clash.
 */
export async function claimAskGuestData(
  anonId: string,
  userId: string,
  client?: TypedSupabaseClient
): Promise<{ threads: number }> {
  const supabase = client ?? getSupabaseAdminClient();
  const { data: moved, error: tErr } = await supabase
    .from('ask_threads')
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq('anon_id', anonId)
    .is('user_id', null)
    .select('id');
  if (tErr) throw tErr;
  const { error: mErr } = await supabase
    .from('ask_messages')
    .update({ user_id: userId })
    .eq('anon_id', anonId)
    .is('user_id', null);
  if (mErr) throw mErr;

  const [guestFacts, userFacts] = await Promise.all([
    getAskMemory({ anonId }, supabase),
    getAskMemory({ userId }, supabase),
  ]);
  if (Object.keys(guestFacts).length > 0) {
    await saveAskMemory({ userId }, { ...userFacts, ...guestFacts }, supabase);
    await supabase.from('ask_memory').delete().eq('anon_id', anonId).is('user_id', null);
  }
  return { threads: moved?.length ?? 0 };
}
