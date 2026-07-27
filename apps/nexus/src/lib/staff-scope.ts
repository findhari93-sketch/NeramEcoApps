/**
 * Session scoping for external teachers.
 *
 * Capabilities (./staff-capabilities) answer "may you do this at all". This
 * module answers "to which class". The two compose: a `teacher` holds
 * teach.grade, but only for sessions they are the tutor of.
 *
 * Why the scope is the SESSION and not the classroom: there is currently exactly
 * one live classroom (the merged B.Arch cohort), so scoping an external teacher
 * "to their classroom" would restrict nothing at all. The meaningful unit is the
 * individual scheduled class, nexus_scheduled_classes.teacher_id.
 *
 * Internal staff (admin, manager) pass every check unconditionally: the whole
 * point of that tier is that they see and run every class.
 *
 * Kept separate from staff-capabilities.ts because these helpers touch the
 * database, and that module must stay pure so the client can import it.
 */
import { getSupabaseAdminClient } from '@neram/database';
import { ApiError } from '@/lib/api-errors';
import { isInternalStaff, type RequestUser } from '@/lib/study-materials';
import { canTutor } from '@/lib/staff-capabilities';

/**
 * Assert the caller may act on this specific scheduled class.
 *
 * Internal staff: always allowed. External teacher: only when they are the
 * assigned tutor. A missing class is a 404 rather than a 403 so a stale link
 * does not read as a permissions problem.
 */
export async function assertSessionAccess(user: RequestUser, classId: string): Promise<void> {
  if (isInternalStaff(user)) return;

  const supabase = getSupabaseAdminClient();
  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, teacher_id')
    .eq('id', classId)
    .maybeSingle();

  if (!cls) throw new ApiError('Class not found.', 404);
  if (cls.teacher_id !== user.id) {
    throw new ApiError('You can only act on classes you are the tutor of.', 403);
  }
}

/**
 * Scope descriptor for list endpoints.
 *
 * Returns `{ teacherId }` for an external teacher and `{}` for internal staff,
 * so a query narrows with one optional filter:
 *
 *   const scope = sessionScopeFilter(user);
 *   let q = supabase.from('nexus_scheduled_classes').select('*');
 *   if (scope.teacherId) q = q.eq('teacher_id', scope.teacherId);
 */
export function sessionScopeFilter(user: RequestUser): { teacherId?: string } {
  return isInternalStaff(user) ? {} : { teacherId: user.id };
}

/** True when this caller sees every class (internal staff). */
export function seesAllSessions(user: RequestUser): boolean {
  return isInternalStaff(user);
}

/**
 * Assert a user id is allowed to be the tutor of a class.
 *
 * Called on every write to nexus_scheduled_classes.teacher_id, not only in the
 * picker UI, so a non-teaching manager can never be made a tutor by a crafted
 * request. Note can_teach defaults to true for every row in the DB, including
 * students, which is why the staff tier is checked first (canTutor does both).
 */
export async function assertCanTutor(candidateUserId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: candidate } = await supabase
    .from('users')
    .select('id, name, user_type, staff_role, can_teach')
    .eq('id', candidateUserId)
    .maybeSingle();

  if (!candidate) throw new ApiError('Selected tutor not found.', 400);
  if (!canTutor(candidate)) {
    throw new ApiError(
      `${candidate.name || 'That person'} is not available to take classes.`,
      400,
    );
  }
}

/** A staff member who may be assigned as a class tutor. */
export interface TutorCandidate {
  id: string;
  name: string | null;
  email: string | null;
  staff_role: string | null;
  ms_oid: string | null;
}

/**
 * Staff who may be offered in the Add-Class tutor picker: any staff tier with
 * can_teach, excluding E2E test accounts.
 *
 * The `e2e%` exclusion mirrors the existing convention in the admin app's
 * alumni list. Local E2E runs write to the production database, so test teacher
 * rows are real rows here and would otherwise be selectable as the tutor of a
 * real class.
 */
export async function getTutorEligibleStaff(): Promise<TutorCandidate[]> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('users')
    .select('id, name, email, staff_role, ms_oid, user_type, can_teach')
    .in('user_type', ['admin', 'teacher'])
    .eq('can_teach', true)
    .eq('is_disabled', false)
    .not('email', 'ilike', 'e2e%')
    .order('name');

  return ((data || []) as TutorCandidate[]).filter((u) => canTutor(u as never));
}

/**
 * Internal staff (admin + manager) who should receive every class meeting on
 * their Teams calendar.
 *
 * This is the core team who need visibility of every class that runs. External
 * teachers are invited only to the classes they tutor, which is what stops the
 * calendar clutter that motivated the role split.
 */
export async function getInternalStaffForCalendar(): Promise<TutorCandidate[]> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('users')
    .select('id, name, email, staff_role, ms_oid, user_type, linked_classroom_email')
    .in('staff_role', ['admin', 'manager'])
    .eq('is_disabled', false)
    .not('email', 'ilike', 'e2e%');

  return (data || []) as TutorCandidate[];
}
