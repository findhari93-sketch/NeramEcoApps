import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { transitionBody, type TransitionResult } from '@/lib/pad/prompt-routes';
import { parseDetailsRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintPrompt, padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/prompts/:id/details  (session teacher)
 *
 * Body: { label: string | null, text: string | null }
 *
 * The teacher's reference for the question ("38", shown as Q.38) and the
 * question as typed or dictated, edited after the ASK: the number typed once
 * the question was already open, or a dictation typo. Both travel together, as
 * the teacher last saw them, so an edit to one never wipes the other. Any state.
 * Students see both, so everyone's screen is told to refresh.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const parsed = parseDetailsRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });

    const result = await callPad<TransitionResult>(padDb(), 'pad_set_details', {
      p_actor: caller.user.id,
      p_prompt: params.id,
      p_label: parsed.value.label,
      p_text: parsed.value.text,
    });
    if (result.changed) await hintPrompt(params.id, 'everyone');
    return padJson(transitionBody(result));
  } catch (err) {
    return padErrorResponse(err, 'details');
  }
}
