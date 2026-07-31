import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Is this user part of a class right now?
 *
 * The single source of truth for who may file a bug report from the student
 * app. `participation_status` is deliberately NOT filtered: a break year
 * student drops out of monitoring but never loses access, so they keep the
 * reporter. Graduated and removed students carry `is_active = false` and are
 * excluded, as is every lead, who has no enrollment row at all.
 *
 * Fails closed. A query error returns false rather than letting a report
 * through on the assumption that the reader is enrolled.
 */
export async function isEnrolledStudent(
  userId: string,
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client
    .from('nexus_enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'student')
    .eq('is_active', true)
    .limit(1);

  if (error) {
    console.error('[enrollment] isEnrolledStudent lookup failed:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
