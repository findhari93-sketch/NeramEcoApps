import type { AccountTier, UserType } from '../types';

/**
 * Compute account tier from existing user data.
 * Pure function — no DB calls.
 *
 * An enrolled_student is identified by having a linked_classroom_email
 * (admin links the tools app user to their Nexus classroom ID).
 * Also falls back to user_type === 'student' for backward compatibility.
 */
export function computeAccountTier(
  userType: UserType,
  linkedClassroomEmail: string | null
): AccountTier {
  if (linkedClassroomEmail) return 'enrolled_student';
  if (userType === 'student') return 'enrolled_student';
  if (userType === 'lead') return 'active_lead';
  return 'visitor';
}
