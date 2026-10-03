/**
 * Adding one sketch to a student's sketchbook. Extracted from
 * POST /api/sketchbook/entries so the assistant's upload flow and the
 * sketchbook screen create a sketch the same way: completed on arrival, one
 * practice day and one award per IST day, inspiration link checked first.
 *
 * A sketch is a drawing_submissions row with source_type 'sketchbook' and status
 * 'completed': nothing is pending, nobody grades it. Several sketches on one
 * IST day are one practice day and one points award.
 */
import { getSupabaseAdminClient } from '@neram/database';
import {
  createDrawingSubmission, getInspirationItem, getStudentPrimaryClassroom, recordGamificationEvent, upsertPracticeDay,
} from '@neram/database/queries/nexus';
import { ApiError } from '@/lib/api-errors';
import { practiceDate, type Rhythm } from '@/lib/sketchbook-rhythm';
import { loadStudentRhythm } from '@/lib/sketchbook-payload';
import { parseQuality } from '@/lib/image-quality';

export const CAPTION_MAX = 80;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AddSketchResult {
  sketch: Record<string, unknown>;
  rhythm: Rhythm;
  isNewDay: boolean;
}

export async function addSketchForStudent(
  caller: { id: string; user_type: string | null },
  body: unknown,
): Promise<AddSketchResult> {
  if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
  const b = (body ?? {}) as Record<string, unknown>;

  const originalUrl = typeof b.original_image_url === 'string' ? b.original_image_url : '';
  if (!/^https:\/\//.test(originalUrl)) throw new ApiError('Missing original_image_url', 400);
  const thumbnailUrl = typeof b.thumbnail_url === 'string' && /^https:\/\//.test(b.thumbnail_url) ? b.thumbnail_url : null;
  const caption = typeof b.caption === 'string' ? b.caption.trim().slice(0, CAPTION_MAX) : '';
  // The phone's measurement, fingerprint included (lib/image-fingerprint.ts).
  // Unmeasured is a valid state, so a bad or missing value never blocks the sketch.
  const imageQuality = parseQuality(b.image_quality);

  let inspirationItemId: string | null = null;
  if (b.inspiration_item_id !== undefined && b.inspiration_item_id !== null) {
    const raw = b.inspiration_item_id;
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) throw new ApiError('That Inspiration drawing was not found.', 400);
    // Checked before anything is saved: a student can only practise from a drawing they can see.
    const { item } = await getInspirationItem(raw, caller.id, 'visible');
    if (!item) throw new ApiError('That Inspiration drawing was not found.', 400);
    inspirationItemId = raw;
  }

  const supabase = getSupabaseAdminClient();
  const submission = await createDrawingSubmission({
    student_id: caller.id,
    source_type: 'sketchbook',
    original_image_url: originalUrl,
    self_note: caption || null,
  });
  // createDrawingSubmission hardcodes status 'submitted'; this write is what
  // actually turns the row into a sketch (status 'completed'), plus the two
  // columns createDrawingSubmission predates.
  const { error: finishError } = await supabase
    .from('drawing_submissions')
    .update({ status: 'completed', thumbnail_url: thumbnailUrl, thread_id: submission.id, inspiration_item_id: inspirationItemId })
    .eq('id', submission.id);
  if (finishError) {
    // Never leave a half-made sketch behind as a 'submitted' orphan in the review queue.
    await supabase.from('drawing_submissions').delete().eq('id', submission.id);
    throw finishError;
  }
  if (imageQuality) {
    // Its own write and never fatal, like the assignment route's storeQuality: an
    // environment without the column costs an unmeasured photo, never the sketch.
    // `as any` like the assignment route's storeQuality: image_quality (migration
    // 20260914110000) is not in the generated Database type yet.
    const { error: qualityError } = await (supabase as any)
      .from('drawing_submissions')
      .update({ image_quality: imageQuality })
      .eq('id', submission.id);
    if (qualityError) console.error('[sketchbook] could not store the photo measurement:', qualityError.message);
  }

  // The rhythm counts every drawing upload on the student's own clock; see
  // loadStudentRhythm. The same clock dates this sketch for the ledger.
  const { rhythm, timeZone } = await loadStudentRhythm(caller.id);
  const today = practiceDate(submission.submitted_at || new Date(), timeZone);
  // The practice-days table is now only the points ledger (one award per
  // sketchbook day).
  const { isNewDay } = await upsertPracticeDay(caller.id, today, submission.id);

  const classroom = await getStudentPrimaryClassroom(caller.id);
  if (isNewDay && classroom) {
    // One award per practice day, keyed so a second sketch the same day is a no-op.
    recordGamificationEvent({
      student_id: caller.id,
      classroom_id: classroom.id,
      batch_id: classroom.batch_id,
      event_type: 'drawing_submitted',
      points: 2,
      source_id: `sketch_day_${today}`,
      activity_type: 'drawing_submitted',
      activity_title: 'Added a sketch to their sketchbook',
      metadata: { submission_id: submission.id, practice_date: today },
    }).catch(() => {});
  }

  return {
    sketch: { ...submission, status: 'completed', thumbnail_url: thumbnailUrl, inspiration_item_id: inspirationItemId },
    rhythm,
    isNewDay,
  };
}
