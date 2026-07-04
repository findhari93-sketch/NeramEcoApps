/**
 * Shared server helpers for the Study Materials API routes.
 *
 * Resolves the requesting Nexus user, derives a student's "exam set" from their active
 * classroom enrolments (used for audience filtering), and asserts staff access.
 */
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';

export interface RequestUser {
  id: string;
  user_type: string | null;
  student_program: string | null;
  name: string | null;
}

/** Verify the MS/test/impersonation token and load the matching Nexus user row. */
export async function getRequestUser(tokenString: string | null): Promise<RequestUser> {
  const msUser = await verifyMsToken(tokenString);
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, student_program, name')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user) throw new Error('User not found');
  return user as RequestUser;
}

export function isStaff(user: RequestUser): boolean {
  return user.user_type === 'teacher' || user.user_type === 'admin';
}

export function assertStaff(user: RequestUser): void {
  if (!isStaff(user)) throw new Error('Not authorized');
}

/**
 * Distinct classroom types ('nata' | 'jee' | ...) across the student's active enrolments.
 * Used as the student's "exam set" for audience filtering. Empty when unknown (treated as
 * show-all by isFolderVisibleToStudent).
 */
export async function getStudentExamSet(userId: string): Promise<string[]> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('nexus_enrollments')
    .select('classroom:nexus_classrooms(type)')
    .eq('user_id', userId)
    .eq('is_active', true);

  const types = new Set<string>();
  for (const row of (data as any[]) || []) {
    const classroom = row.classroom;
    const type = Array.isArray(classroom) ? classroom[0]?.type : classroom?.type;
    if (type) types.add(type);
  }
  return [...types];
}
