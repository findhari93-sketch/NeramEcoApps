import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { transitionBody, type TransitionResult } from '@/lib/pad/prompt-routes';
import { parseLabelRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintPrompt, padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/prompts/:id/label  (session teacher)
 *
 * Body: { label: string | null }
 *
 * The teacher's reference for a prompt ("38", shown as Q.38, or "Kinematics
 * Q3"). Up to 80 characters after spaces are collapsed; null or blank clears it.
 * Students and the meeting screen show it too, so everyone refreshes. The
 * console now edits through /details, which carries the question text as well.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const parsed = parseLabelRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });

    const result = await callPad<TransitionResult>(padDb(), 'pad_set_label', {
      p_actor: caller.user.id,
      p_prompt: params.id,
      p_label: parsed.value.label,
    });
    await hintPrompt(params.id, 'everyone');
    return padJson(transitionBody(result));
  } catch (err) {
    return padErrorResponse(err, 'label');
  }
}
