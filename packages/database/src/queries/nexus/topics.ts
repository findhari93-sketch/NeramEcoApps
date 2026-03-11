import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export async function getTopicsByClassroom(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_topics')
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createTopic(
  data: { classroom_id: string; title: string; description?: string; category?: string; sort_order?: number },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: topic, error } = await supabase
    .from('nexus_topics')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return topic;
}

export async function updateTopic(
  topicId: string,
  updates: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_topics')
    .update(updates)
    .eq('id', topicId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
