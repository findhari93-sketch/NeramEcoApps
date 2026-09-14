/**
 * Loading the photo review roster. One query, shared by every photo review route.
 *
 * This lived inside api/photo-review/route.ts until the automatic face check
 * (api/photo-review/auto-check) needed exactly the same people. Two copies of a
 * roster query is how this feature has already drifted, so there is one.
 *
 * Active, non-alumni students of one classroom who can actually sign in to Nexus.
 *
 * Students with no Microsoft account are excluded. They are enrolled (they paid
 * through the marketing link before Entra provisioning) but they have never seen
 * Nexus, so there is no photo of theirs to judge: what shows on their card is the
 * Google account picture that came in with their signup, which they never offered
 * as a face photo. Reviewing it approves something the student never submitted,
 * and the photo gate it feeds can never apply to someone who cannot log in.
 * They stay visible on the Students screen, flagged. See lib/microsoft-account.ts.
 *
 * The FK must be named. nexus_enrollments points at users TWICE (user_id and
 * removed_by), so a bare `user:users(...)` embed is ambiguous and PostgREST
 * refuses it. Every other call site in the repo names it the same way. And the
 * error is raised rather than swallowed: a discarded error here looked exactly
 * like "no students need review", which is how this shipped broken.
 */
import { filterPhotoRoster } from './photo-roster';

/**
 * Who Photo Review shows: participating students, plus Not started ones.
 *
 * Paused students are in no list or count (founder rule, 2026-09-13). Not started
 * students (dormant_source 'auto', migration 20260919090000) are dormant too, but
 * they are exactly who this queue exists for: no photo is why they have not got
 * in. Filtering them out emptied the No photo tab. The badge RPC carries the same
 * clause; photo-review-predicate.test.ts holds the two together.
 */
export const PHOTO_ROSTER_PARTICIPATION = 'participation_status.eq.active,dormant_source.eq.auto';

export interface PhotoRosterUser {
  id: string;
  name: string | null;
  email: string | null;
  ms_oid: string | null;
  avatar_url: string | null;
  is_alumni: boolean | null;
  photo_status: string | null;
  photo_submitted_at: string | null;
  photo_reviewed_at: string | null;
  photo_rejection_reason: string | null;
  nexus_last_login_at: string | null;
  /** 'teacher' | 'auto' | null. Only meaningful on an approved photo. */
  photo_review_method: string | null;
  /** Latest face check, see lib/photo-auto-review.ts StoredFaceCheck. */
  photo_ai_check: unknown;
}

export async function loadPhotoRoster(
  supabase: any,
  classroomId: string,
): Promise<PhotoRosterUser[]> {
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select(
      'user_id, user:users!nexus_enrollments_user_id_fkey(id, name, email, ms_oid, avatar_url, is_alumni, photo_status, photo_submitted_at, photo_reviewed_at, photo_rejection_reason, nexus_last_login_at, photo_review_method, photo_ai_check)',
    )
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true)
    .or(PHOTO_ROSTER_PARTICIPATION);
  // Deliberately no filter on nexus_classrooms.is_active / is_archived here.
  // That rule already lives in the two places that need it and agree:
  // /api/auth/me, which builds the dropdown this classroomId comes from, and
  // the viewer CTE in count_pending_photo_reviews. A third copy is a third
  // thing to keep true, and the obvious way to write it (a
  // `nexus_classrooms!inner(...)` embed) is the same shape that once emptied
  // this queue for a 30 student classroom. If the API ever needs to be honest
  // independently of the UI, do it as a parallel liveness lookup returning an
  // explicit 404, never as an inner embed.

  if (error) {
    throw new Error(`Could not load the classroom roster: ${error.message}`);
  }

  return filterPhotoRoster(
    ((data || []) as any[]).map((row) => row.user as PhotoRosterUser | null),
  );
}
