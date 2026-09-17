import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  createDrawingSubmission, getInspirationItem, getStudentPrimaryClassroom, recordGamificationEvent, upsertPracticeDay,
} from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { istDate } from '@/lib/sketchbook-rhythm';
import { loadStudentRhythm } from '@/lib/sketchbook-payload';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CAPTION_MAX = 80;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/sketchbook/entries   (student)
 * body { original_image_url, thumbnail_url?, caption?, inspiration_item_id? }
 *
 * The image is already in the drawing-uploads bucket (POST /api/drawing/upload).
 * A sketch is a drawing_submissions row with source_type 'sketchbook' and status
 * 'completed': nothing is pending, nobody grades it. Several sketches on one
 * IST day are one practice day and one points award.
 * inspiration_item_id links a sketch practised from an Inspiration drawing the
 * student can see ("Practise this").
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);

    const body = await request.json().catch(() => ({}));
    const originalUrl = typeof body?.original_image_url === 'string' ? body.original_image_url : '';
    if (!/^https:\/\//.test(originalUrl)) throw new ApiError('Missing original_image_url', 400);
    const thumbnailUrl = typeof body?.thumbnail_url === 'string' && /^https:\/\//.test(body.thumbnail_url) ? body.thumbnail_url : null;
    const caption = typeof body?.caption === 'string' ? body.caption.trim().slice(0, CAPTION_MAX) : '';

    let inspirationItemId: string | null = null;
    if (body?.inspiration_item_id !== undefined && body?.inspiration_item_id !== null) {
      const raw = body.inspiration_item_id;
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

    const today = istDate(submission.submitted_at || new Date());
    // The practice-days table is now only the points ledger (one award per
    // sketchbook day). The rhythm itself counts every drawing upload; see
    // loadStudentRhythm.
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

    const { rhythm } = await loadStudentRhythm(caller.id, today);

    return NextResponse.json(
      { sketch: { ...submission, status: 'completed', thumbnail_url: thumbnailUrl, inspiration_item_id: inspirationItemId }, rhythm, isNewDay },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not add the sketch');
  }
}
