import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

// Note: These functions use (supabase as any) because nexus_batches and batch_id
// on nexus_enrollments are added by migration 20260330_nexus_batches.sql.
// After applying the migration and running `pnpm supabase:gen:types`, the casts can be removed.

export async function getNexusBatchesByClassroom(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_batches')
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function getNexusBatchById(
  batchId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_batches')
    .select('*')
    .eq('id', batchId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createNexusBatch(
  data: { classroom_id: string; name: string; description?: string },
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data: batch, error } = await supabase
    .from('nexus_batches')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return batch;
}

export async function updateNexusBatch(
  batchId: string,
  data: { name?: string; description?: string; is_active?: boolean },
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data: batch, error } = await supabase
    .from('nexus_batches')
    .update(data)
    .eq('id', batchId)
    .select()
    .single();
  if (error) throw error;
  return batch;
}

export async function deleteNexusBatch(
  batchId: string,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  // Soft delete: deactivate batch and remove batch_id from enrollments
  const { error: enrollError } = await supabase
    .from('nexus_enrollments')
    .update({ batch_id: null })
    .eq('batch_id', batchId);
  if (enrollError) throw enrollError;

  const { error } = await supabase
    .from('nexus_batches')
    .update({ is_active: false })
    .eq('id', batchId);
  if (error) throw error;
}
