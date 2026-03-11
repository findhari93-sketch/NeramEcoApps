import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export async function getChecklistByClassroom(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_checklist_items')
    .select('*, topic:nexus_topics(*), resources:nexus_checklist_resources(*)')
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as any;
}

export async function createChecklistItem(
  data: { classroom_id: string; topic_id?: string; title: string; description?: string; sort_order?: number },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: item, error } = await supabase
    .from('nexus_checklist_items')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return item;
}

export async function addChecklistResource(
  data: { checklist_item_id: string; title: string; resource_type?: string; url: string; sort_order?: number },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: resource, error } = await supabase
    .from('nexus_checklist_resources')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return resource;
}
