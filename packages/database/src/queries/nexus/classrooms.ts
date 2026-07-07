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
    .select('*, user:users!nexus_enrollments_user_id_fkey(id, name, email, phone, avatar_url, user_type), batch:nexus_batches(id, name)')
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

export async function getAllClassrooms(
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_classrooms')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateClassroom(
  classroomId: string,
  data: { name?: string; type?: string; description?: string; ms_team_id?: string; is_active?: boolean },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: classroom, error } = await supabase
    .from('nexus_classrooms')
    .update(data)
    .eq('id', classroomId)
    .select()
    .single();
  if (error) throw error;
  return classroom;
}

export async function enrollUser(
  data: { user_id: string; classroom_id: string; role: 'teacher' | 'student'; batch_id?: string },
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

/**
 * The single "default" classroom = the active classroom with type='common'.
 * A unique partial index guarantees at most one such row, so this is the app's
 * source of truth for "the one classroom everyone is in" during single-classroom
 * mode. Returns null if none is active.
 */
export async function getDefaultClassroom(
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_classrooms')
    .select('*')
    .eq('type', 'common')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Enroll a user (student by default) into the single default classroom, idempotently.
 * DB-only: it creates/reactivates the nexus_enrollments row and returns the
 * classroom so the caller can sync Microsoft Teams membership separately (Graph
 * lives in @neram/auth, kept out of the DB layer). Throws if no default classroom.
 */
export async function enrollUserInDefaultClassroom(
  userId: string,
  opts: { batchId?: string | null; role?: 'teacher' | 'student' } = {},
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const classroom = await getDefaultClassroom(supabase);
  if (!classroom) {
    throw new Error('No active default classroom (type=common) found');
  }
  const enrollData: { user_id: string; classroom_id: string; role: 'teacher' | 'student'; batch_id?: string } = {
    user_id: userId,
    classroom_id: classroom.id,
    role: opts.role || 'student',
  };
  if (opts.batchId) enrollData.batch_id = opts.batchId;
  const enrollment = await enrollUser(enrollData, supabase);
  return { classroom, enrollment };
}

export async function updateEnrollmentBatch(
  enrollmentId: string,
  batchId: string | null,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .update({ batch_id: batchId })
    .eq('id', enrollmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkUpdateEnrollmentBatch(
  enrollmentIds: string[],
  batchId: string | null,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .update({ batch_id: batchId })
    .in('id', enrollmentIds)
    .select();
  if (error) throw error;
  return data;
}

/**
 * List classrooms with their active student counts, for the admin "Graduate
 * Batch to Alumni" picker. A classroom's name (e.g. "NATA 2026") is the most
 * reliable batch signal in production, since most students have no academic_year.
 */
export async function getClassroomsWithStudentCounts(
  client?: TypedSupabaseClient
): Promise<Array<{ id: string; name: string; type: string; is_active: boolean; active_students: number }>> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: classrooms, error } = await supabase
    .from('nexus_classrooms')
    .select('id, name, type, is_active')
    .order('name', { ascending: true });
  if (error) throw error;

  const { data: enrollments, error: enrErr } = await supabase
    .from('nexus_enrollments')
    .select('classroom_id')
    .eq('role', 'student')
    .eq('is_active', true);
  if (enrErr) throw enrErr;

  const counts: Record<string, number> = {};
  for (const e of enrollments || []) {
    counts[e.classroom_id] = (counts[e.classroom_id] || 0) + 1;
  }

  return (classrooms || []).map((c: any) => ({
    ...c,
    active_students: counts[c.id] || 0,
  }));
}

/**
 * Active students enrolled in a classroom, with their alumni state, for the
 * graduation preview. Returns one row per student (deduped across enrollments).
 */
export async function getClassroomStudentsForGraduation(
  classroomId: string,
  client?: TypedSupabaseClient
): Promise<Array<{ id: string; name: string; email: string | null; avatar_url: string | null; is_alumni: boolean; academic_year: string | null }>> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url, is_alumni, academic_year, user_type)')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);
  if (error) throw error;

  const seen = new Set<string>();
  const students: any[] = [];
  for (const row of data || []) {
    const u = row.user;
    // Only real students (defensive: never graduate a teacher/admin enrolled as student).
    if (!u || u.user_type !== 'student' || seen.has(u.id)) continue;
    seen.add(u.id);
    students.push({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar_url: u.avatar_url,
      is_alumni: !!u.is_alumni,
      academic_year: u.academic_year ?? null,
    });
  }
  return students.sort((a, b) => a.name.localeCompare(b.name));
}
