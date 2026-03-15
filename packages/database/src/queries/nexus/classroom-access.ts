import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { ClassroomAccessRequest, ClassroomAccessRequestStatus } from '../../types';

/**
 * Create a classroom access request.
 * If the user already has a pending request, returns the existing one.
 */
export async function createClassroomAccessRequest(
  userId: string,
  userName: string,
  userEmail: string | null,
  client?: TypedSupabaseClient
): Promise<ClassroomAccessRequest> {
  const supabase = client || getSupabaseAdminClient();

  // Check for existing pending request first
  const existing = await getClassroomAccessRequest(userId, client);
  if (existing && existing.status === 'pending') {
    return existing;
  }

  const { data, error } = await supabase
    .from('classroom_access_requests')
    .insert({
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ClassroomAccessRequest;
}

/**
 * Get the latest classroom access request for a user.
 */
export async function getClassroomAccessRequest(
  userId: string,
  client?: TypedSupabaseClient
): Promise<ClassroomAccessRequest | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('classroom_access_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows
    throw error;
  }
  return data as ClassroomAccessRequest;
}

/**
 * Update a classroom access request status (for admin use).
 */
export async function updateClassroomAccessRequestStatus(
  requestId: string,
  status: ClassroomAccessRequestStatus,
  reviewedBy: string,
  adminNotes?: string,
  client?: TypedSupabaseClient
): Promise<ClassroomAccessRequest> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('classroom_access_requests')
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return data as ClassroomAccessRequest;
}

/**
 * List all pending classroom access requests (for admin view).
 */
export async function listPendingClassroomAccessRequests(
  client?: TypedSupabaseClient
): Promise<ClassroomAccessRequest[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('classroom_access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as ClassroomAccessRequest[];
}
