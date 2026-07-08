// @ts-nocheck — nexus_course_modules / nexus_course_topics / resources / topic_tests not yet in
// generated Supabase types; regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusCourseModule,
  NexusCourseTopic,
  NexusCourseTopicResource,
  NexusCourseTopicTest,
} from '../../types';

const MODULES = 'nexus_course_modules';
const TOPICS = 'nexus_course_topics';
const RESOURCES = 'nexus_course_topic_resources';
const TOPIC_TESTS = 'nexus_course_topic_tests';

export interface NexusCourseModuleWithTopics extends NexusCourseModule {
  topics: NexusCourseTopic[];
}

// ============================================================
// Modules
// ============================================================

/**
 * All modules with their topics, ordered for the repository browser. By default
 * only active rows (the working repository); pass includeInactive to also return
 * archived subjects/topics so the UI can offer Restore.
 */
export async function listCourseModules(
  opts?: { includeInactive?: boolean },
  client?: TypedSupabaseClient,
): Promise<NexusCourseModuleWithTopics[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase.from(MODULES).select('*, topics:nexus_course_topics(*)');
  if (!opts?.includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((m) => ({
    ...m,
    topics: (m.topics || [])
      .filter((t) => opts?.includeInactive || t.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
  })) as NexusCourseModuleWithTopics[];
}

export async function createCourseModule(
  data: {
    title: string;
    description?: string | null;
    exam_tags?: string[];
    color?: string | null;
    created_by: string;
  },
  client?: TypedSupabaseClient,
): Promise<NexusCourseModule> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error } = await supabase.from(MODULES).insert(data).select().single();
  if (error) throw error;
  return row as NexusCourseModule;
}

export async function updateCourseModule(
  id: string,
  updates: Partial<NexusCourseModule>,
  client?: TypedSupabaseClient,
): Promise<NexusCourseModule> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(MODULES)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as NexusCourseModule;
}

/** Minimal module row for ownership / permission checks (create_by, active flag). */
export async function getCourseModuleMeta(
  id: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; title: string; created_by: string | null; is_active: boolean } | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(MODULES)
    .select('id, title, created_by, is_active')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; title: string; created_by: string | null; is_active: boolean } | null;
}

/** How many plan entries reference any topic inside this module (blocks a hard delete). */
export async function countModulePlanUsage(
  id: string,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { data: topicRows, error: tErr } = await supabase.from(TOPICS).select('id').eq('module_id', id);
  if (tErr) throw tErr;
  const ids = (topicRows || []).map((t) => t.id);
  if (!ids.length) return 0;
  const { count, error } = await supabase
    .from('nexus_teaching_plan_entries')
    .select('id', { count: 'exact', head: true })
    .in('topic_id', ids);
  if (error) throw error;
  return count || 0;
}

/** Hard-delete a module (its topics/resources/tests cascade; plan entries keep, topic_id SET NULL). */
export async function deleteCourseModule(id: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(MODULES).delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Topics
// ============================================================

export interface NexusCourseTopicDetail extends NexusCourseTopic {
  module: Pick<NexusCourseModule, 'id' | 'title' | 'color'> | null;
  resources: NexusCourseTopicResource[];
  tests: (NexusCourseTopicTest & { test: { id: string; title: string } | null })[];
  /** Number of plans this topic is placed in (repository "In N plans" badge). */
  used_in_plans: number;
}

export async function getCourseTopic(
  id: string,
  client?: TypedSupabaseClient,
): Promise<NexusCourseTopicDetail | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TOPICS)
    .select(
      '*, module:nexus_course_modules(id, title, color), ' +
        'resources:nexus_course_topic_resources(*), ' +
        'tests:nexus_course_topic_tests(*, test:nexus_tests(id, title))',
    )
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  const { count } = await supabase
    .from('nexus_teaching_plan_entries')
    .select('id', { count: 'exact', head: true })
    .eq('topic_id', id);
  return {
    ...data,
    resources: (data.resources || []).sort((a, b) => a.sort_order - b.sort_order),
    used_in_plans: count || 0,
  } as NexusCourseTopicDetail;
}

export async function createCourseTopic(
  data: {
    module_id: string;
    title: string;
    priority?: string;
    intended_delivery?: string;
    estimated_sessions?: number;
    created_by: string;
  },
  client?: TypedSupabaseClient,
): Promise<NexusCourseTopic> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error } = await supabase.from(TOPICS).insert(data).select().single();
  if (error) throw error;
  return row as NexusCourseTopic;
}

export async function updateCourseTopic(
  id: string,
  updates: Partial<NexusCourseTopic>,
  client?: TypedSupabaseClient,
): Promise<NexusCourseTopic> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TOPICS)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as NexusCourseTopic;
}

/** Minimal topic row for ownership / permission checks. */
export async function getCourseTopicMeta(
  id: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; title: string; created_by: string | null; is_active: boolean; module_id: string } | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TOPICS)
    .select('id, title, created_by, is_active, module_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as
    | { id: string; title: string; created_by: string | null; is_active: boolean; module_id: string }
    | null;
}

/** How many plan entries reference this single topic ("In N plans"; blocks a hard delete). */
export async function countTopicPlanUsage(id: string, client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from('nexus_teaching_plan_entries')
    .select('id', { count: 'exact', head: true })
    .eq('topic_id', id);
  if (error) throw error;
  return count || 0;
}

/** Hard-delete a topic (its resources/test-links cascade; plan entries keep, topic_id SET NULL). */
export async function deleteCourseTopic(id: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(TOPICS).delete().eq('id', id);
  if (error) throw error;
}

/** Just the authored class content of a topic (agenda seeding). */
export async function getTopicAuthoredContent(
  topicId: string,
  client?: TypedSupabaseClient,
): Promise<{ activities: string | null; drills: string | null } | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TOPICS)
    .select('activities, drills')
    .eq('id', topicId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Publish topics as student-visible self-learning modules (idempotent). */
export async function publishTopicsAsSelfLearning(
  topicIds: string[],
  client?: TypedSupabaseClient,
): Promise<void> {
  if (!topicIds.length) return;
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(TOPICS)
    .update({
      is_self_learning: true,
      visible_to_students: true,
      updated_at: new Date().toISOString(),
    })
    .in('id', topicIds);
  if (error) throw error;
}

/** How many plan entries reference each of the given topics ("In N plans" badges). */
export async function getTopicUsageCounts(
  topicIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, number>> {
  if (topicIds.length === 0) return {};
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_teaching_plan_entries')
    .select('topic_id, plan_id')
    .in('topic_id', topicIds);
  if (error) throw error;
  const plansByTopic: Record<string, Set<string>> = {};
  for (const row of data || []) {
    if (!row.topic_id) continue;
    (plansByTopic[row.topic_id] ||= new Set()).add(row.plan_id);
  }
  return Object.fromEntries(Object.entries(plansByTopic).map(([k, v]) => [k, v.size]));
}

// ============================================================
// Topic resources + test links
// ============================================================

export async function addTopicResource(
  data: {
    topic_id: string;
    kind: 'link' | 'youtube' | 'study_file';
    title: string;
    url?: string | null;
    study_file_id?: string | null;
    section?: 'resource' | 'drill';
  },
  client?: TypedSupabaseClient,
): Promise<NexusCourseTopicResource> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error } = await supabase
    .from(RESOURCES)
    .insert({ ...data, section: data.section ?? 'resource' })
    .select()
    .single();
  if (error) throw error;
  return row as NexusCourseTopicResource;
}

/** Study-file resources of a topic flagged as drills (for one-tap "attach topic drills"). */
export async function getTopicDrillFiles(
  topicId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; title: string; study_file_id: string }[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RESOURCES)
    .select('id, title, study_file_id')
    .eq('topic_id', topicId)
    .eq('kind', 'study_file')
    .eq('section', 'drill')
    .not('study_file_id', 'is', null);
  if (error) throw error;
  return (data || []) as { id: string; title: string; study_file_id: string }[];
}

export async function removeTopicResource(
  id: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(RESOURCES).delete().eq('id', id);
  if (error) throw error;
}

export async function linkTopicTest(
  data: { topic_id: string; test_id: string; purpose?: 'quiz' | 'practice' },
  client?: TypedSupabaseClient,
): Promise<NexusCourseTopicTest> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error } = await supabase.from(TOPIC_TESTS).upsert(data, {
    onConflict: 'topic_id,test_id',
  }).select().single();
  if (error) throw error;
  return row as NexusCourseTopicTest;
}

export async function unlinkTopicTest(
  topicId: string,
  testId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(TOPIC_TESTS)
    .delete()
    .eq('topic_id', topicId)
    .eq('test_id', testId);
  if (error) throw error;
}
