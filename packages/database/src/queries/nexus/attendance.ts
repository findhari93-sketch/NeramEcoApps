import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export async function getAttendanceByClass(
  scheduledClassId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_attendance')
    .select('*, student:users!nexus_attendance_student_id_fkey(id, name, avatar_url)')
    .eq('scheduled_class_id', scheduledClassId);
  if (error) throw error;
  return (data || []) as any;
}

export async function getStudentAttendance(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_attendance')
    .select('*, scheduled_class:nexus_scheduled_classes!inner(classroom_id)')
    .eq('student_id', studentId)
    .eq('nexus_scheduled_classes.classroom_id', classroomId);
  if (error) throw error;
  return (data || []).map((d: any) => ({ ...d, scheduled_class: undefined }));
}

export async function getStudentAttendanceSummary(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient
): Promise<{ total: number; attended: number; percentage: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Count total completed classes in classroom
  const { count: totalClasses } = await supabase
    .from('nexus_scheduled_classes')
    .select('id', { count: 'exact', head: true })
    .eq('classroom_id', classroomId)
    .eq('status', 'completed');

  // Count attended
  const { count: attendedClasses } = await supabase
    .from('nexus_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('attended', true);

  const total = totalClasses || 0;
  const attended = attendedClasses || 0;
  return {
    total,
    attended,
    percentage: total > 0 ? Math.round((attended / total) * 100) : 0,
  };
}

export async function recordAttendance(
  data: { scheduled_class_id: string; student_id: string; attended: boolean; source?: 'teams' | 'manual'; joined_at?: string; left_at?: string; duration_minutes?: number },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: attendance, error } = await supabase
    .from('nexus_attendance')
    .upsert(data, { onConflict: 'scheduled_class_id,student_id' })
    .select()
    .single();
  if (error) throw error;
  return attendance;
}
