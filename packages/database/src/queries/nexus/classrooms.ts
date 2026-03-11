import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export async function getClassroomsByUser(
  userId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('classroom:nexus_classrooms(*)')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).map((d: any) => d.classroom).filter(Boolean);
}

export async function getClassroomById(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_classrooms')
    .select('*')
    .eq('id', classroomId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function getEnrollmentsByClassroom(
  classroomId: string,
  role?: 'teacher' | 'student',
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('nexus_enrollments')
    .select('*, user:users(id, name, email, phone, avatar_url, user_type)')
    .eq('classroom_id', classroomId)
    .eq('is_active', true);
  if (role) query = query.eq('role', role);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as any;
}

export async function getUserEnrollment(
  userId: string,
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('*')
    .eq('user_id', userId)
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function getUserRoleInClassroom(
  userId: string,
  classroomId: string,
  client?: TypedSupabaseClient
): Promise<'teacher' | 'student' | null> {
  const enrollment = await getUserEnrollment(userId, classroomId, client);
  return (enrollment?.role as 'teacher' | 'student') || null;
}

export async function createClassroom(
  data: { name: string; type: string; description?: string; ms_team_id?: string; created_by?: string },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: classroom, error } = await supabase
    .from('nexus_classrooms')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return classroom;
}

export async function enrollUser(
  data: { user_id: string; classroom_id: string; role: 'teacher' | 'student' },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: enrollment, error } = await supabase
    .from('nexus_enrollments')
    .upsert(data, { onConflict: 'user_id,classroom_id' })
    .select()
    .single();
  if (error) throw error;
  return enrollment;
}
