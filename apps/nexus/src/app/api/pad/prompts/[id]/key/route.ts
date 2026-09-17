import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { transitionBody, type TransitionResult } from '@/lib/pad/prompt-routes';
import { parseKeyRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintPrompt, padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/prompts/:id/key  (session teacher, prompt CLOSED)
 *
 * Body: { keys: string[] } or { ungraded: true }
 *
 * Chooses the correct answer (several are allowed for an ambiguous question) or
 * Poll / Don't grade, as many times as needed before REVEAL. Keys are
 * normalised like answers, so "b" and " B " are the same key. Only the teacher's
 * screens are hinted: nothing about a key may reach a student before REVEAL.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const parsed = parseKeyRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });

    const result = await callPad<TransitionResult>(padDb(), 'pad_set_key', {
      p_actor: caller.user.id,
      p_prompt: params.id,
      p_keys: parsed.value.keys,
      p_ungraded: parsed.value.ungraded,
    });
    if (result.changed) await hintPrompt(params.id, 'teacher');
    return padJson(transitionBody(result));
  } catch (err) {
    return padErrorResponse(err, 'set key');
  }
}
