/**
 * Shared server helpers for the Study Materials API routes.
 *
 * Resolves the requesting Nexus user, derives a student's "exam set" from their active
 * classroom enrolments (used for audience filtering), and asserts staff access.
 */
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { ApiError } from '@/lib/api-errors';
import {
  can,
  isInternalStaff as isInternalStaffRole,
  resolveStaffRole,
  type Capability,
  type StaffRole,
} from '@/lib/staff-capabilities';

export interface RequestUser {
  id: string;
  user_type: string | null;
  student_program: string | null;
  name: string | null;
  /** Nexus authority tier. Null until the staff_role backfill reaches this row. */
  staff_role: string | null;
  /** Tutor eligibility. Orthogonal to staff_role. */
  can_teach: boolean | null;
}

/** Verify the MS/test/impersonation token and load the matching Nexus user row. */
export async function getRequestUser(tokenString: string | null): Promise<RequestUser> {
  const msUser = await verifyMsToken(tokenString);

  // Defence in depth. verifyMsToken already rejects parent tokens unless the
  // caller passes allowParent, and this helper never does, so in practice this
  // is unreachable. It stays because it costs nothing and it means a future
  // change to that default cannot silently open the staff surface to parents.
  if (msUser.parentUserId) {
    throw new ApiError('Parent accounts cannot access this resource.', 403);
  }

  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, student_program, name, staff_role, can_teach')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user) throw new Error('User not found');
  return user as RequestUser;
}

export function isStaff(user: RequestUser): boolean {
  return staffRoleOf(user) !== null;
}

export function assertStaff(user: RequestUser): void {
  if (!isStaff(user)) throw new Error('Not authorized');
}

export function isAdmin(user: RequestUser): boolean {
  return staffRoleOf(user) === 'admin';
}

/** The caller's effective Nexus tier (staff_role, falling back to user_type). */
export function staffRoleOf(user: RequestUser): StaffRole | null {
  return resolveStaffRole(user);
}

/**
 * admin or manager: the internal core team, who act across ALL classes.
 * An external `teacher` is additionally session-scoped, see ./staff-scope.
 */
export function isInternalStaff(user: RequestUser): boolean {
  return isInternalStaffRole(staffRoleOf(user));
}

/** Does the caller hold this capability? Fail-closed. */
export function hasCapability(user: RequestUser, capability: Capability): boolean {
  return can(staffRoleOf(user), capability, user.can_teach !== false);
}

/**
 * Capability gate for a route handler. Throws a 403 ApiError naming the missing
 * capability, so a denial is debuggable from the response instead of collapsing
 * into a generic "Not authorized".
 *
 * Use this instead of an inline `user_type === 'teacher' || 'admin'` check. A
 * bare assertStaff() still means "any staff tier" and is correct for reads that
 * every staff member may perform.
 */
export function assertCapability(user: RequestUser, capability: Capability): void {
  if (!hasCapability(user, capability)) {
    throw new ApiError(`Not authorized: this action requires ${capability}.`, 403);
  }
}

/**
 * Owner-or-admin gate for mutating a shared repository row (subject/topic).
 * Admin and manager may act on anything (they own the org-wide repository); a
 * teacher only on rows they created; a row with no recorded owner (legacy data)
 * is internal-staff-only. Throws a 403 ApiError otherwise.
 */
export function assertCanMutate(user: RequestUser, createdBy: string | null | undefined): void {
  if (isInternalStaff(user)) return;
  if (createdBy && createdBy === user.id) return;
  throw new ApiError('You can only edit or delete items you created.', 403);
}

/**
 * The consolidated single classroom (type='common') is the merged B.Arch cohort, which
 * prepares for both NATA and JEE Paper 2. Expand it to those exams so exam-tagged Study
 * Materials stay visible after the single-classroom consolidation (a 'common' student would
 * otherwise match no exam-targeted folder).
 */
const COMMON_CLASSROOM_EXAMS = ['nata', 'jee'];

/**
 * Distinct classroom types ('nata' | 'jee' | ...) across the student's active enrolments.
 * Used as the student's "exam set" for audience filtering. Empty when unknown (treated as
 * show-all by isFolderVisibleToStudent). The consolidated 'common' classroom expands to the
 * exams it serves (see COMMON_CLASSROOM_EXAMS).
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
    if (!type) continue;
    if (type === 'common') {
      for (const e of COMMON_CLASSROOM_EXAMS) types.add(e);
    } else {
      types.add(type);
    }
  }
  return [...types];
}
