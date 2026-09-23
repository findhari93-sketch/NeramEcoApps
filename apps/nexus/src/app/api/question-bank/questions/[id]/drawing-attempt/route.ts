import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
import { submitQBDrawingAttempt, getStudentQBDrawingState, getSupabaseAdminClient } from '@neram/database';

import { describeError } from '@/lib/api-errors';
import { parseQuality } from '@/lib/image-quality';

/**
 * The phone's own measurement of the photo, and the 400px copy the sketchbook
 * grid loads instead of the full sheet. Written after the insert rather than
 * through submitQBDrawingAttempt so the shared query keeps its signature and
 * only Nexus rebuilds.
 *
 * Best effort on purpose, the same rule as the drawing module's storeQuality:
 * an unmeasured photo is a valid state, a lost drawing is not.
 */
async function storeExtras(
  submissionId: string,
  raw: { thumbnailUrl: string | null; imageQuality: unknown },
) {
  const patch: Record<string, unknown> = {};
  const quality = parseQuality(raw.imageQuality);
  if (quality) patch.image_quality = quality;
  if (raw.thumbnailUrl) patch.thumbnail_url = raw.thumbnailUrl;
  if (Object.keys(patch).length === 0) return;
  try {
    const supabase = getSupabaseAdminClient() as any;
    await supabase.from('drawing_submissions').update(patch).eq('id', submissionId);
  } catch (err) {
    console.error('[QB drawing attempt] could not store extras:', describeError(err));
  }
}

/**
 * A student's drawing for a bank question.
 *
 * Separate from the ordinary attempt route because a drawing is not an answer
 * that can be checked. It goes into drawing_submissions and waits for a human,
 * and no nexus_qb_student_attempts row is written until a teacher has marked
 * it: is_correct is NOT NULL, so a row written now would have to claim a sheet
 * nobody has looked at is either right or wrong, and that claim feeds the
 * student's accuracy percentage.
 *
 * Not classroom scoped: the row lands in drawing_submissions, which has no
 * classroom_id column, so there is nothing for a classroom to authorise. See
 * the note in drawing-state/route.ts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;
    const body = await request.json();
    const { original_image_url, self_note, thumbnail_url, image_quality, part } = body as {
      original_image_url?: string;
      self_note?: string | null;
      thumbnail_url?: string | null;
      image_quality?: unknown;
      part?: string | null;
    };

    const access = await verifyQBAccessAnyClassroom(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    const caller = access.caller;

    if (!original_image_url || typeof original_image_url !== 'string') {
      return NextResponse.json({ error: 'original_image_url is required' }, { status: 400 });
    }

    const partId = part || '';

    const result = await submitQBDrawingAttempt({
      qbQuestionId: questionId,
      studentId: caller.id,
      partId,
      originalImageUrl: original_image_url,
      selfNote: self_note ?? null,
    });

    await storeExtras(result.submissionId, {
      thumbnailUrl: thumbnail_url ?? null,
      imageQuality: image_quality,
    });

    const state = await getStudentQBDrawingState(questionId, caller.id, { partId });

    return NextResponse.json({ data: { ...result, state } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';

    // "not a drawing" is the caller using the wrong route. "not in redo state"
    // is the thread rule doing its job, and a student pressing submit twice
    // should read that sentence, not a 500.
    if (message === 'This question is not a drawing.') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes('not in redo state') || message.includes('not set up for practice')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    console.error('[QB drawing attempt] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
