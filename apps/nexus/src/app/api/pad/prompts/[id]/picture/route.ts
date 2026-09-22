import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { transitionBody, type TransitionResult } from '@/lib/pad/prompt-routes';
import { parsePictureRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintPrompt, padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/prompts/:id/picture  (session teacher, live session)
 *
 * Body: { imageUrl: string | null }
 *
 * Adds, replaces or removes the question's picture after the ASK: the teacher
 * asked first and snipped the paper a moment later. The address must be one
 * /api/pad/sessions/:id/image returned for this session; the database refuses
 * any other with 400 INVALID_INPUT. Students see it, so everyone refreshes.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const parsed = parsePictureRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });

    const result = await callPad<TransitionResult>(padDb(), 'pad_set_picture', {
      p_actor: caller.user.id,
      p_prompt: params.id,
      p_image_url: parsed.value.imageUrl,
    });
    if (result.changed) await hintPrompt(params.id, 'everyone');
    return padJson(transitionBody(result));
  } catch (err) {
    return padErrorResponse(err, 'picture');
  }
}
