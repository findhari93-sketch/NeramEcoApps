/**
 * Who belongs in the teacher photo review queue.
 *
 * Pulled out of the route so the rule is testable on its own: the queue silently
 * showing the wrong people is exactly the failure mode this feature has already
 * had twice (an unnamed foreign key once emptied it completely, and before that
 * the sidebar badge counted ~1,350 marketing leads it could never show).
 *
 * Two exclusions, for different reasons:
 *   - alumni: graduated, no longer managed here.
 *   - no Microsoft account: enrolled and paid, but they have never opened Nexus
 *     and cannot, so the picture on their card is the Google account photo that
 *     arrived with their signup rather than anything they submitted. Approving it
 *     would push a face onto the tenant identity that the student never offered,
 *     and the photo gate it feeds can never apply to someone who cannot log in.
 *     They stay visible on the Students screen, flagged instead of hidden.
 */
import { hasMicrosoftAccount } from './microsoft-account';

export interface PhotoRosterCandidate {
  id: string;
  ms_oid?: string | null;
  is_alumni?: boolean | null;
}

/** True when this student's photo is the teacher's to judge. */
export function isPhotoReviewable(user: PhotoRosterCandidate | null | undefined): boolean {
  if (!user) return false;
  if (user.is_alumni === true) return false;
  return hasMicrosoftAccount(user.ms_oid);
}

/**
 * Narrow a raw classroom roster to the reviewable students. Nulls are dropped,
 * which is what a PostgREST embed yields for a row whose join found nothing.
 */
export function filterPhotoRoster<T extends PhotoRosterCandidate>(
  users: (T | null | undefined)[],
): T[] {
  return users.filter((u): u is T => isPhotoReviewable(u));
}
