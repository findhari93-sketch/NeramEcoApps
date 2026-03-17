import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export async function getRsvpsByClass(
  classId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_class_rsvp')
    .select('*, student:users!nexus_class_rsvp_student_id_fkey(id, name, avatar_url)')
    .eq('scheduled_class_id', classId)
    .order('responded_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function getRsvpSummary(
  classId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_class_rsvp')
    .select('response')
    .eq('scheduled_class_id', classId);
  if (error) throw error;

  const attending = (data || []).filter((r: any) => r.response === 'attending').length;
  const notAttending = (data || []).filter((r: any) => r.response === 'not_attending').length;
  return { attending, not_attending: notAttending, total: (data || []).length };
}

export async function getStudentRsvp(
  classId: string,
  studentId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_class_rsvp')
    .select('*')
    .eq('scheduled_class_id', classId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertRsvp(
  classId: string,
  studentId: string,
  response: 'attending' | 'not_attending',
  reason?: string | null,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_class_rsvp')
    .upsert(
      {
        scheduled_class_id: classId,
        student_id: studentId,
        response,
        reason: reason || null,
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'scheduled_class_id,student_id' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
