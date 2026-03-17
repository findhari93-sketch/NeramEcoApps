import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export async function getReviewsByClass(
  classId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_class_reviews')
    .select('*, student:users!nexus_class_reviews_student_id_fkey(id, name, avatar_url)')
    .eq('scheduled_class_id', classId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function getClassAverageRating(
  classId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_class_reviews')
    .select('rating')
    .eq('scheduled_class_id', classId);
  if (error) throw error;

  const ratings = (data || []).map((r: any) => r.rating);
  if (ratings.length === 0) return { average: 0, count: 0 };
  const sum = ratings.reduce((a: number, b: number) => a + b, 0);
  return { average: sum / ratings.length, count: ratings.length };
}

export async function getStudentReview(
  classId: string,
  studentId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_class_reviews')
    .select('*')
    .eq('scheduled_class_id', classId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertReview(
  classId: string,
  studentId: string,
  rating: number,
  comment?: string | null,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_class_reviews')
    .upsert(
      {
        scheduled_class_id: classId,
        student_id: studentId,
        rating,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'scheduled_class_id,student_id' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
