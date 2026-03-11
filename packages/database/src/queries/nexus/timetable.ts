import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export async function getScheduledClasses(
  classroomId: string,
  startDate: string,
  endDate: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .select('*, topic:nexus_topics(*), teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url)')
    .eq('classroom_id', classroomId)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .order('scheduled_date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data || []) as any;
}

export async function getUpcomingClasses(
  classroomId: string,
  limit: number = 5,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .select('*, topic:nexus_topics(*), teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url)')
    .eq('classroom_id', classroomId)
    .gte('scheduled_date', today)
    .in('status', ['scheduled', 'live'])
    .order('scheduled_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []) as any;
}

export async function getTodaysClasses(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const today = new Date().toISOString().split('T')[0];
  return getScheduledClasses(classroomId, today, today, client);
}

export async function createScheduledClass(
  data: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: cls, error } = await supabase
    .from('nexus_scheduled_classes')
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return cls;
}

export async function updateScheduledClass(
  classId: string,
  updates: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .update(updates as any)
    .eq('id', classId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
