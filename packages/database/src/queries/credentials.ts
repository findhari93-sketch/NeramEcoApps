/**
 * Neram Classes - Student Credentials Queries
 *
 * Database operations for student credential vault (MS Teams login, etc.)
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get active credentials for a user
 */
export async function getActiveCredentialsByUserId(
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('student_credentials')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Mark credential as viewed and set auto-destroy timer (24 hours from first view)
 */
export async function markCredentialViewed(
  credentialId: string,
  supabase: SupabaseClient
) {
  const now = new Date().toISOString();
  const autoDestroyAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('student_credentials')
    .update({
      viewed_at: now,
      auto_destroy_at: autoDestroyAt,
    })
    .eq('id', credentialId)
    .is('viewed_at', null)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Destroy a credential (student-initiated or auto-expiry)
 */
export async function destroyCredential(
  credentialId: string,
  supabase: SupabaseClient
) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('student_credentials')
    .update({
      is_active: false,
      destroyed_at: now,
    })
    .eq('id', credentialId)
    .eq('is_active', true)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Get credential by ID (for reveal action — returns full password)
 */
export async function getCredentialById(
  credentialId: string,
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('student_credentials')
    .select('id, password')
    .eq('id', credentialId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error) throw error;
  return data;
}
