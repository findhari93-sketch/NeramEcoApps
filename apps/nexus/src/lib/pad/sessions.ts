/**
 * Server-side reads the /api/pad routes need around the pad_* functions.
 *
 * Browsers never touch pad tables. These helpers run with the service role on
 * the server, and they only READ: every state change still goes through a
 * pad_* function, so the guard triggers and the audit log see all of them.
 */

import { getSupabaseAdminClient, loadClassroomRoster } from '@neram/database';
import { TtlCache } from '@/lib/ttl-cache';
import type { PadCaller } from './caller';
import { CLASS_BINDING_COLUMNS, type ScheduledClassCandidate } from './meeting-binding';
import { broadcastHint } from './realtime';

/** The admin client, untyped: pad_* tables and functions are newer than the generated types. */
export function padDb(): any {
  return getSupabaseAdminClient() as any;
}

export interface SessionMeta {
  id: string;
  classroom_id: string;
  batch_id: string | null;
  teacher_id: string;
  /** Possibly a few seconds stale; never decide anything on it. The functions check the live row. */
  status: 'live' | 'ended';
  hint_topic: string;
  teacher_topic: string;
  /** The Teams meeting the session was started in. A resume never changes it. */
  meeting_id: string | null;
}

/**
 * A teacher's console asks for a snapshot on every hint and every few seconds
 * as a safety net. The classroom, teacher and topics never change and the
 * section changes only when a resume fills a missing one, so a few seconds of
 * caching is safe.
 */
const metaCache = new TtlCache<SessionMeta>(10_000, 500);

export async function loadSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const cached = metaCache.get(sessionId);
  if (cached) return cached;

  const { data, error } = await padDb()
    .from('pad_sessions')
    .select('id, classroom_id, batch_id, teacher_id, status, hint_topic, teacher_topic, meeting_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  metaCache.set(sessionId, data as SessionMeta);
  return data as SessionMeta;
}

/**
 * Where the bot can reach a meeting: the conversation Teams most recently told
 * it about. Rows are written only by the bot route, after the connector's token
 * is verified, so the service URL is one Microsoft gave.
 */
export async function meetingConversation(meetingId: string): Promise<{ conversation_id: string; service_url: string } | null> {
  const { data, error } = await padDb()
    .from('pad_bot_conversations')
    .select('conversation_id, service_url')
    .eq('meeting_id', meetingId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { conversation_id: string; service_url: string } | null) ?? null;
}

/** The live session started in a Teams meeting, newest first, or null. */
export async function liveSessionForMeeting(meetingId: string): Promise<string | null> {
  const { data, error } = await padDb()
    .from('pad_sessions')
    .select('id')
    .eq('meeting_id', meetingId)
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

/** A session's room code, which never changes once the session exists. */
export async function sessionRoomCode(sessionId: string): Promise<string | null> {
  const { data, error } = await padDb().from('pad_sessions').select('room_code').eq('id', sessionId).maybeSingle();
  if (error) throw error;
  return ((data as { room_code?: string } | null)?.room_code as string | undefined) ?? null;
}

/** A prompt never moves to another session, so its session is held for a long time. */
const promptSessionCache = new TtlCache<string>(10 * 60_000, 2_000);

export async function loadPromptSessionId(promptId: string): Promise<string | null> {
  const cached = promptSessionCache.get(promptId);
  if (cached) return cached;

  const { data, error } = await padDb().from('pad_prompts').select('session_id').eq('id', promptId).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  promptSessionCache.set(promptId, data.session_id as string);
  return data.session_id as string;
}

export interface RosterView {
  /** Tracked students: the denominator every count is taken against. */
  ids: string[];
  names: Record<string, string | null>;
}

/**
 * The denominator: loadClassroomRoster's tracked ids, the single definition of
 * who counts towards a classroom (dormant and alumni excluded). A minute of
 * caching means a student enrolled mid-class is counted from the next minute.
 */
const rosterCache = new TtlCache<RosterView>(60_000, 200);

export async function rosterFor(classroomId: string, batchId: string | null): Promise<RosterView> {
  const key = `${classroomId}:${batchId ?? ''}`;
  const cached = rosterCache.get(key);
  if (cached) return cached;

  const roster = await loadClassroomRoster(classroomId, { batchId });
  const names: Record<string, string | null> = {};
  for (const member of roster.members) names[member.user_id] = member.user.name;
  const view: RosterView = { ids: roster.ids, names };
  rosterCache.set(key, view);
  return view;
}

export async function rosterIds(classroomId: string, batchId: string | null): Promise<string[]> {
  return (await rosterFor(classroomId, batchId)).ids;
}

/** Names for students who answered without being on the roster (a dormant student, say). */
export async function userNames(ids: readonly string[]): Promise<Record<string, string | null>> {
  if (!ids.length) return {};
  const { data, error } = await padDb().from('users').select('id, name').in('id', [...ids]);
  if (error) throw error;
  const names: Record<string, string | null> = {};
  for (const row of (data || []) as Array<{ id: string; name: string | null }>) names[row.id] = row.name;
  return names;
}

/** Test and debugging seam. */
export function __clearPadSessionCaches(): void {
  metaCache.clear();
  promptSessionCache.clear();
  rosterCache.clear();
}

/**
 * Who a change is news for. Students hear about state changes (ASK, CLOSE,
 * REOPEN, REVEAL, END); only the teacher hears about answers arriving and keys
 * being chosen, which must never reach a student.
 */
export type HintAudience = 'everyone' | 'teacher';

/** Tell a session's screens to refetch. Best effort: never throws. */
export async function hintSession(sessionId: string, audience: HintAudience, options: { throttleMs?: number } = {}): Promise<void> {
  const meta = await loadSessionMeta(sessionId).catch(() => null);
  if (!meta) return;
  const topics = audience === 'everyone' ? [meta.hint_topic, meta.teacher_topic] : [meta.teacher_topic];
  await broadcastHint(topics, options);
}

export async function hintPrompt(promptId: string, audience: HintAudience, options: { throttleMs?: number } = {}): Promise<void> {
  const sessionId = await loadPromptSessionId(promptId).catch(() => null);
  if (sessionId) await hintSession(sessionId, audience, options);
}

export async function loadScheduledClass(classId: string): Promise<ScheduledClassCandidate | null> {
  const { data, error } = await padDb()
    .from('nexus_scheduled_classes')
    .select(CLASS_BINDING_COLUMNS)
    .eq('id', classId)
    .maybeSingle();
  if (error) throw error;
  return (data as ScheduledClassCandidate | null) ?? null;
}

export async function batchBelongsToClassroom(batchId: string, classroomId: string): Promise<boolean> {
  const { data, error } = await padDb()
    .from('nexus_batches')
    .select('id')
    .eq('id', batchId)
    .eq('classroom_id', classroomId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** An active teacher enrollment in the classroom. */
export async function teachesClassroom(userId: string, classroomId: string): Promise<boolean> {
  const { data, error } = await padDb()
    .from('nexus_enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('classroom_id', classroomId)
    .eq('role', 'teacher')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export interface ClassroomChoice {
  id: string;
  name: string;
}

/**
 * The classrooms offered when a meeting matches no class: every live classroom
 * for internal staff, the ones they teach in for an external teacher.
 */
export async function classroomsForStaff(caller: PadCaller): Promise<ClassroomChoice[]> {
  const supabase = padDb();

  let classroomIds: string[] | null = null;
  if (!caller.internal) {
    const { data, error } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id')
      .eq('user_id', caller.user.id)
      .eq('role', 'teacher')
      .eq('is_active', true);
    if (error) throw error;
    classroomIds = ((data || []) as Array<{ classroom_id: string }>).map((row) => row.classroom_id);
    if (!classroomIds.length) return [];
  }

  let query = supabase
    .from('nexus_classrooms')
    .select('id, name')
    .eq('is_active', true)
    .eq('is_archived', false)
    .order('name');
  if (classroomIds) query = query.in('id', classroomIds);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ClassroomChoice[];
}
