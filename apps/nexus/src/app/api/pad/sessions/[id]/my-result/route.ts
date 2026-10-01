import { NextRequest } from 'next/server';
import { assertPadStudent, resolvePadCaller } from '@/lib/pad/caller';
import type { StudentRoundResult } from '@/lib/pad/round-results';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { loadSessionMeta, padDb, rosterIds } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pad/sessions/:id/my-result  (enrolled student)
 *
 * { published: false } until the teacher publishes. Then the student's own
 * result (never their rank; only whether they are in the top five), the top
 * five by name, and the class average. Nobody else's score is ever returned.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStudent(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');
    const sessionId = params.id.toLowerCase();

    const meta = await loadSessionMeta(sessionId);
    if (!meta) throw new PadRefusal('NOT_FOUND');

    const result = await callPad(padDb(), 'pad_student_results', {
      p_actor: caller.user.id,
      p_session: sessionId,
      p_roster: await rosterIds(meta.classroom_id, meta.batch_id),
    });
    const { ok: _ok, ...body } = result as Record<string, unknown>;
    return padJson(body as unknown as StudentRoundResult);
  } catch (err) {
    return padErrorResponse(err, 'my result');
  }
}
