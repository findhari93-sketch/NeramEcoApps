import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { submitQBDrawingAttempt, getStudentQBDrawingState } from '@neram/database';

import { describeError } from '@/lib/api-errors';

/**
 * A student's drawing for a bank question.
 *
 * Separate from the ordinary attempt route because a drawing is not an answer
 * that can be checked. It goes into drawing_submissions and waits for a human,
 * and no nexus_qb_student_attempts row is written until a teacher has marked
 * it: is_correct is NOT NULL, so a row written now would have to claim a sheet
 * nobody has looked at is either right or wrong, and that claim feeds the
 * student's accuracy percentage.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;
    const body = await request.json();
    const { original_image_url, self_note, classroom_id } = body as {
      original_image_url?: string;
      self_note?: string | null;
      classroom_id?: string | null;
    };

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroom_id || null);
    if (!access.ok) return access.response;
    const caller = access.caller;

    if (!original_image_url || typeof original_image_url !== 'string') {
      return NextResponse.json({ error: 'original_image_url is required' }, { status: 400 });
    }

    const result = await submitQBDrawingAttempt({
      qbQuestionId: questionId,
      studentId: caller.id,
      originalImageUrl: original_image_url,
      selfNote: self_note ?? null,
    });

    const state = await getStudentQBDrawingState(questionId, caller.id);

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
