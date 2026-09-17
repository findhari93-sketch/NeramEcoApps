import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/sessions/:id/end  (session teacher)
 *
 * Body: { confirmUnrevealed?: boolean }
 *
 * With a prompt still open or closed but not revealed, the first call answers
 * 409 UNREVEALED_PROMPT { sequence } so the console can ask "Q7 isn't revealed,
 * end anyway?". Ending again is a no-op success ({ changed: false }).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const body = await request.json().catch(() => null);
    const confirmUnrevealed = !!body && typeof body === 'object' && (body as Record<string, unknown>).confirmUnrevealed === true;

    const result = await callPad<{ changed: boolean }>(padDb(), 'pad_end_session', {
      p_actor: caller.user.id,
      p_session: params.id,
      p_confirm_unrevealed: confirmUnrevealed,
    });
    return padJson({ changed: result.changed });
  } catch (err) {
    return padErrorResponse(err, 'end session');
  }
}
