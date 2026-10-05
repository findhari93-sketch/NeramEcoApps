import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintSession, padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/sessions/:id/cant-use-pad  (session teacher)
 *
 * Body: { studentId: string, on: boolean }
 *
 * Marks (on) or unmarks (off) a student who cannot use the pad for the rest of
 * the round: every question not yet revealed, and every one asked after,
 * excuses them, so they never count as not answered. Answers { on, questions }.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const body = await request.json().catch(() => null);
    const fields = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    if (typeof fields.studentId !== 'string' || !isUuid(fields.studentId)) throw new PadRefusal('INVALID_INPUT', { field: 'studentId' });
    if (typeof fields.on !== 'boolean') throw new PadRefusal('INVALID_INPUT', { field: 'on' });

    const result = await callPad<{ on: boolean; questions: number }>(padDb(), 'pad_mark_cant_use_pad', {
      p_actor: caller.user.id,
      p_session: params.id,
      p_student: fields.studentId,
      p_on: fields.on,
    });
    // The student's own screen shows the excuse too, so both audiences refetch.
    await hintSession(params.id, 'everyone');
    return padJson({ on: result.on, questions: result.questions });
  } catch (err) {
    return padErrorResponse(err, 'cant use pad');
  }
}
