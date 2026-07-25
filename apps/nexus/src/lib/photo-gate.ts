/**
 * Mandatory face-visible profile photo: the gate decision, in one pure function.
 *
 * Every Nexus student must have a clear photo of their own face, approved by a
 * teacher. There is no AI check anywhere in this flow, a human looks at every
 * photo. A student without one gets a full-screen blocker whose only content is
 * the camera/upload widget and Sign Out, so they can clear it themselves in
 * under a minute.
 *
 * This module is PURE TypeScript (no JSX, no next/navigation, no Supabase) so
 * the same decision runs on the server (/api/auth/me) and in unit tests. Same
 * discipline as feature-flags.ts.
 *
 * Deliberate rules, each of which has bitten a previous access gate:
 *
 *   pending is NOT a block. A student who uploads at 11pm must not sit locked
 *   out until a teacher wakes up. Only "no photo at all" and "a teacher said no"
 *   block.
 *
 *   Impersonation is never blocked. A teacher using "View as Student" is
 *   inspecting an account for support, and a photo demand would stop them cold.
 *
 *   A student with no active classroom is never blocked. They already get
 *   NoClassroomWelcome from RoleGuard, which is the more useful message ("ask
 *   an admin to add you"). Demanding a photo from someone who cannot enter
 *   anyway is just noise.
 *
 *   Staff are never blocked. The rule targets students, and blocking staff
 *   risks locking out the very people who have to run the review queue.
 */

export type PhotoStatus = 'missing' | 'pending' | 'approved' | 'rejected';

/** Feature-flag id that arms the gate. Off by default, see feature-flags.ts. */
export const PHOTO_GATE_FEATURE = 'student.photo-gate';

/** Statuses that stop a student from entering Nexus (when the flag is on). */
const BLOCKING_STATUSES: PhotoStatus[] = ['missing', 'rejected'];

export interface PhotoGateInput {
  /** Resolved value of the student.photo-gate flag. */
  flagEnabled: boolean;
  /** 'student' | 'teacher' | 'admin', as derived by /api/auth/me. */
  nexusRole: string;
  /** True when the request carries an impersonation token. */
  impersonating: boolean;
  /** Number of active, non-archived classrooms the user is enrolled in. */
  classroomCount: number;
  photoStatus: PhotoStatus;
}

/** Normalize an unknown DB value into a PhotoStatus, defaulting to 'missing'. */
export function toPhotoStatus(value: unknown): PhotoStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected'
    ? value
    : 'missing';
}

/** Should this request be shown the full-screen photo blocker? */
export function shouldBlockForPhoto(input: PhotoGateInput): boolean {
  if (!input.flagEnabled) return false;
  if (input.nexusRole !== 'student') return false;
  if (input.impersonating) return false;
  if (input.classroomCount <= 0) return false;
  return BLOCKING_STATUSES.includes(input.photoStatus);
}

/** What /api/auth/me returns, and what the client blocker reads. */
export interface PhotoGateState {
  status: PhotoStatus;
  /** Teacher's rejection reason, only ever set when status is 'rejected'. */
  reason: string | null;
  required: boolean;
}

/**
 * Safe default for the client before /api/auth/me resolves, and for E2E test
 * mode. Never blocks: a gate that defaults to "blocked" would flash the blocker
 * on every page load for every compliant student.
 */
export const DEFAULT_PHOTO_GATE: PhotoGateState = {
  status: 'approved',
  reason: null,
  required: false,
};
