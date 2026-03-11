import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export async function getStudentTopicProgress(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_student_topic_progress')
    .select('*')
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId);
  if (error) throw error;
  return data || [];
}

export async function getStudentChecklistProgress(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_student_checklist_progress')
    .select('*, checklist_item:nexus_checklist_items!inner(classroom_id)')
    .eq('student_id', studentId)
    .eq('nexus_checklist_items.classroom_id', classroomId);
  if (error) throw error;
  return (data || []).map((d: any) => ({ ...d, checklist_item: undefined }));
}

export async function updateChecklistProgress(
  studentId: string,
  checklistItemId: string,
  isCompleted: boolean,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_student_checklist_progress')
    .upsert({
      student_id: studentId,
      checklist_item_id: checklistItemId,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    }, { onConflict: 'student_id,checklist_item_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getClassroomProgressSummary(
  classroomId: string,
  client?: TypedSupabaseClient
): Promise<{ totalTopics: number; totalChecklist: number }> {
  const supabase = client || getSupabaseAdminClient();
  const [topicsResult, checklistResult] = await Promise.all([
    supabase.from('nexus_topics').select('id', { count: 'exact', head: true }).eq('classroom_id', classroomId).eq('is_active', true),
    supabase.from('nexus_checklist_items').select('id', { count: 'exact', head: true }).eq('classroom_id', classroomId).eq('is_active', true),
  ]);
  return {
    totalTopics: topicsResult.count || 0,
    totalChecklist: checklistResult.count || 0,
  };
}
