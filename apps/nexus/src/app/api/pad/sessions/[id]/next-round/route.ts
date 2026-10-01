import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintSession, padDb } from '@/lib/pad/sessions';
import { storeRoundResults } from '@/lib/pad/store-results';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pad/sessions/:id/next-round  (session teacher)
 *
 * Body: { confirmUnrevealed?: boolean }
 *
 * Ends this round (if it is still running) and starts the next one in the same
 * meeting, with the same class and the same room code, so students carry on
 * without joining again: their pads see the next round on their next refresh.
 * A question still waiting for its answer first answers 409 UNREVEALED_PROMPT
 * { sequence, label, count }, as End round does. Pressing it again returns the
 * round already running ({ changed: false }).
 *
 * 200 { sessionId, roundNo, roomCode, changed }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');
    const sessionId = params.id.toLowerCase();

    const body = await request.json().catch(() => null);
    const confirmUnrevealed = !!body && typeof body === 'object' && (body as Record<string, unknown>).confirmUnrevealed === true;

    const result = await callPad<{ changed: boolean; session_id: string; round_no: number; room_code?: string }>(padDb(), 'pad_next_round', {
      p_actor: caller.user.id,
      p_session: sessionId,
      p_confirm_unrevealed: confirmUnrevealed,
    });
    // The pads still on the old round learn about the new one from its snapshot.
    if (result.changed) {
      await hintSession(sessionId, 'everyone');
      await storeRoundResults(sessionId, caller.user.id);
    }
    return padJson({ sessionId: result.session_id, roundNo: result.round_no, roomCode: result.room_code ?? null, changed: result.changed });
  } catch (err) {
    return padErrorResponse(err, 'next round');
  }
}
