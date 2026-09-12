import { getSupabaseAdminClient } from '@neram/database';
import { listUserClassroomIds, usersShareClassroom } from '@neram/database/queries/nexus';
import { ApiError } from '@/lib/api-errors';
import { extractBearerToken } from '@/lib/ms-verify';
import { isInternalStaff, isStaff, type RequestUser } from '@/lib/study-materials';

/**
 * Who may open whose sketchbook.
 *
 * Internal staff (admin, manager) see every student. A teacher sees a student
 * when they share an active classroom. Membership is the access rule, exactly
 * as everywhere else in Nexus; there is no per-feature grant.
 */
export async function assertStaffSeesStudent(caller: RequestUser, studentId: string): Promise<void> {
  if (!isStaff(caller)) throw new ApiError('Not authorized', 403);
  if (isInternalStaff(caller)) return;
  const ok = await usersShareClassroom(caller.id, studentId);
  if (!ok) throw new ApiError('You do not teach this student.', 403);
}

/** The classrooms whose sketchbooks this staff member flips through. */
export async function staffClassroomIds(caller: RequestUser): Promise<string[]> {
  if (!isStaff(caller)) throw new ApiError('Not authorized', 403);
  if (isInternalStaff(caller)) {
    const { data, error } = await getSupabaseAdminClient().from('nexus_classrooms').select('id').eq('is_active', true);
    if (error) throw new ApiError('Failed to load classrooms', 500);
    return (data || []).map((c: { id: string }) => c.id);
  }
  return listUserClassroomIds(caller.id, 'teacher');
}

/** Nexus's own test, impersonation and parent tokens are not Microsoft's. */
export function isRealGraphToken(token: string | null): boolean {
  return !!token && !/^(test_|imp_|par_)/.test(token);
}

/** The delegated Graph bearer, or a 400 that says why Teams posting is off. */
export function realGraphToken(authHeader: string | null): string {
  const token = extractBearerToken(authHeader);
  if (!isRealGraphToken(token)) {
    throw new ApiError('Posting to Teams needs a Microsoft sign-in.', 400);
  }
  return token as string;
}
