import {
  getFileById,
  getFolderById,
  getRecapById,
  isFolderVisibleToStudent,
} from '@neram/database';
import { getRequestUser, isStaff, getStudentExamSet, type RequestUser } from '@/lib/study-materials';

/**
 * Who may watch a Foundation chapter track.
 *
 * A track lives in nexus_class_recaps, so the obvious thing would be to reuse
 * the recap routes. That does not work, and the reason is worth stating plainly
 * because it is the sharp edge of sharing that table.
 *
 * The recap routes authorise with an enrollment lookup keyed on
 * recap.classroom_id. A track has classroom_id NULL, and PostgREST's .eq()
 * never matches NULL, so that lookup returns nothing and every student is
 * refused. Refused is the safe direction, but it is safe by accident: the check
 * is not deciding anything, it is just failing. Relying on that is how a later
 * "fix" for the 403 turns into an open door.
 *
 * So tracks authorise on the thing that actually governs a chapter: the study
 * folder's audience. Foundation Books are standard for every exam cohort, which
 * is precisely why classroom enrollment is the wrong question. This mirrors
 * assertStudentCanSee in the chapter-test route.
 */

export class TrackAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Staff see everything. A student sees a chapter their folder targets. */
export async function assertCanSeeChapter(user: RequestUser, fileId: string): Promise<void> {
  if (isStaff(user)) return;

  const file = await getFileById(fileId);
  if (!file || file.is_deleted) throw new TrackAccessError('Chapter not found', 404);

  const folder = await getFolderById(file.folder_id);
  if (!folder) throw new TrackAccessError('Chapter not found', 404);

  const exams = await getStudentExamSet(user.id);
  if (!isFolderVisibleToStudent(folder, exams, user.student_program)) {
    // 404 rather than 403: whether a chapter exists is itself information about
    // another cohort's materials.
    throw new TrackAccessError('Chapter not found', 404);
  }
}

/**
 * Resolve a track id to its chapter and check the caller may see it. Returns the
 * track so callers do not fetch it twice.
 */
export async function assertCanSeeTrack(user: RequestUser, trackId: string) {
  const track = await getRecapById(trackId);
  // Not a track at all, i.e. someone pointed a track route at a class recap.
  // Refuse rather than serve it under folder-audience rules it was never
  // authorised by.
  if (!track?.study_file_id) throw new TrackAccessError('Recording not found', 404);

  await assertCanSeeChapter(user, track.study_file_id);
  return track;
}

/** A track is servable only when it is both published and ready. */
export function assertServable(track: { status: string; readiness?: string | null }): void {
  if (track.status !== 'published' || (track.readiness ?? 'ready') !== 'ready') {
    throw new TrackAccessError('This recording is not ready yet', 403);
  }
}

/** Turn a thrown TrackAccessError into a response shape, or rethrow. */
export function trackErrorResponse(err: unknown): { error: string; status: number } {
  if (err instanceof TrackAccessError) return { error: err.message, status: err.status };
  const message = err instanceof Error ? err.message : 'Something went wrong';
  return { error: message, status: message === 'Not authorized' ? 403 : 500 };
}

export { getRequestUser };
