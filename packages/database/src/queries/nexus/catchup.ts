// @ts-nocheck — nexus_catchup_tracks / nexus_catchup_items not yet in generated Supabase
// types; regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusCatchupTrack, NexusCatchupItem } from '../../types';

const TRACKS = 'nexus_catchup_tracks';
const ITEMS = 'nexus_catchup_items';

export interface NexusCatchupItemDetail extends NexusCatchupItem {
  topic: {
    id: string;
    title: string;
    summary: string | null;
    estimated_sessions: number;
    module: { id: string; title: string; color: string | null } | null;
    resources: {
      id: string;
      kind: string;
      title: string;
      url: string | null;
      study_file_id: string | null;
    }[];
    tests: { id: string; test_id: string; purpose: string; test: { id: string; title: string } | null }[];
  } | null;
}

export interface NexusCatchupTrackDetail extends NexusCatchupTrack {
  items: NexusCatchupItemDetail[];
  student: { id: string; name: string | null; avatar_url: string | null } | null;
}

const ITEM_SELECT =
  '*, topic:nexus_course_topics(id, title, summary, estimated_sessions, ' +
  'module:nexus_course_modules(id, title, color), ' +
  'resources:nexus_course_topic_resources(id, kind, title, url, study_file_id), ' +
  'tests:nexus_course_topic_tests(id, test_id, purpose, test:nexus_tests(id, title)))';

/** Students who joined the classroom after the plan started. */
export async function listLateJoiners(
  classroomId: string,
  planStartDate: string,
  client?: TypedSupabaseClient,
): Promise<
  {
    user_id: string;
    enrolled_at: string;
    user: { id: string; name: string | null; email: string | null; avatar_url: string | null } | null;
  }[]
> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('user_id, enrolled_at, user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url)')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true)
    .gt('enrolled_at', `${planStartDate}T23:59:59+05:30`)
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listTracksForPlan(
  planId: string,
  client?: TypedSupabaseClient,
): Promise<(NexusCatchupTrack & { done_count: number; item_count: number })[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TRACKS)
    .select('*, items:nexus_catchup_items(id, status)')
    .eq('plan_id', planId);
  if (error) throw error;
  return (data || []).map((t) => {
    const items = t.items || [];
    const { items: _drop, ...track } = t;
    return {
      ...track,
      item_count: items.length,
      done_count: items.filter((i) => i.status === 'done').length,
    };
  });
}

export async function getTrackWithItems(
  planId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<NexusCatchupTrackDetail | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TRACKS)
    .select(
      `*, student:users!nexus_catchup_tracks_student_id_fkey(id, name, avatar_url), items:nexus_catchup_items(${ITEM_SELECT})`,
    )
    .eq('plan_id', planId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.items = (data.items || []).sort((a, b) => a.position - b.position);
  return data as NexusCatchupTrackDetail;
}

export async function upsertTrack(
  planId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<NexusCatchupTrack> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TRACKS)
    .upsert(
      { plan_id: planId, student_id: studentId, updated_at: new Date().toISOString() },
      { onConflict: 'plan_id,student_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as NexusCatchupTrack;
}

/** Replace a track's items, preserving done status for topics that remain. */
export async function replaceTrackItems(
  trackId: string,
  items: { topic_id: string; entry_id?: string | null }[],
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { data: existing, error: exErr } = await supabase
    .from(ITEMS)
    .select('topic_id, status, completed_at')
    .eq('track_id', trackId);
  if (exErr) throw exErr;
  const doneByTopic = new Map(
    (existing || []).filter((i) => i.status === 'done').map((i) => [i.topic_id, i.completed_at]),
  );
  const { error: delErr } = await supabase.from(ITEMS).delete().eq('track_id', trackId);
  if (delErr) throw delErr;
  if (!items.length) return;
  const { error } = await supabase.from(ITEMS).insert(
    items.map((it, i) => ({
      track_id: trackId,
      topic_id: it.topic_id,
      entry_id: it.entry_id ?? null,
      position: (i + 1) * 10,
      status: doneByTopic.has(it.topic_id) ? 'done' : 'todo',
      completed_at: doneByTopic.get(it.topic_id) ?? null,
    })),
  );
  if (error) throw error;
}

export async function shareTrack(
  trackId: string,
  sharedBy: string,
  client?: TypedSupabaseClient,
): Promise<NexusCatchupTrack> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TRACKS)
    .update({
      shared_at: new Date().toISOString(),
      shared_by: sharedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', trackId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusCatchupTrack;
}

/** Shared tracks for a student, with plan title and full item details. */
export async function listSharedTracksForStudent(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<
  (NexusCatchupTrackDetail & { plan: { id: string; title: string; status: string } | null })[]
> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TRACKS)
    .select(
      `*, plan:nexus_teaching_plans(id, title, status), items:nexus_catchup_items(${ITEM_SELECT})`,
    )
    .eq('student_id', studentId)
    .not('shared_at', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((t) => ({
    ...t,
    student: null,
    items: (t.items || []).sort((a, b) => a.position - b.position),
  }));
}

export async function getCatchupItem(
  itemId: string,
  client?: TypedSupabaseClient,
): Promise<(NexusCatchupItem & { track: NexusCatchupTrack | null }) | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ITEMS)
    .select('*, track:nexus_catchup_tracks(*)')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateCatchupItemStatus(
  itemId: string,
  status: 'todo' | 'done',
  client?: TypedSupabaseClient,
): Promise<NexusCatchupItem> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ITEMS)
    .update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusCatchupItem;
}

/** Items of a track in order (for sequential-unlock checks). */
export async function listTrackItemPositions(
  trackId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; position: number; status: string }[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ITEMS)
    .select('id, position, status')
    .eq('track_id', trackId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}
