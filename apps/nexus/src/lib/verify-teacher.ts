import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

export interface NexusStaffUser {
  id: string;
  user_type: string;
  name?: string | null;
}

/**
 * Resolve the calling Microsoft user and assert they are staff (teacher/admin).
 * Throws 'Not authorized' otherwise. Mirrors the inline verifyTeacher used
 * across the modules/foundation routes, centralized for the class-recap routes.
 */
export async function verifyTeacher(authorization: string | null): Promise<NexusStaffUser> {
  const msUser = await verifyMsToken(authorization);
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, name')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
    throw new Error('Not authorized');
  }
  return user as NexusStaffUser;
}
