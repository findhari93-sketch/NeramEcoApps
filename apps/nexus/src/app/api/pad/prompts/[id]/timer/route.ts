import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { parseTimerRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintPrompt, padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/prompts/:id/timer  (session teacher)
 *
 * Body: { addSeconds: 1..600 } or { clear: true }
 *
 * More time on the open question ("+15s"), counted from now when its time is
 * already up; a timer on a question that had none; or the timer stopped. On
 * the newest question once closed, more time opens it again first, so "+15s"
 * after time ran out gives the class 15 more seconds.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const parsed = parseTimerRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });

    const result = await callPad<{
      changed: boolean;
      prompt_id: string;
      state: 'open' | 'closed' | 'revealed';
      version: number;
      closes_at: string | null;
      reopened: boolean;
    }>(padDb(), 'pad_set_timer', {
      p_actor: caller.user.id,
      p_prompt: params.id,
      p_add: parsed.value.addSeconds,
      p_clear: parsed.value.clear,
    });
    await hintPrompt(params.id, 'everyone');

    return padJson({
      promptId: result.prompt_id,
      state: result.state,
      version: result.version,
      changed: result.changed,
      closesAt: result.closes_at,
      reopened: result.reopened,
    });
  } catch (err) {
    return padErrorResponse(err, 'timer');
  }
}
