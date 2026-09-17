import { NextRequest } from 'next/server';
import { assertPadStudent, resolvePadCaller } from '@/lib/pad/caller';
import { parseSubmitRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { hintPrompt, padDb } from '@/lib/pad/sessions';

/** A class of sixty answers within seconds; the console needs one refetch, not sixty. */
const TEACHER_HINT_THROTTLE_MS = 1_000;

/**
 * POST /api/pad/submit  (enrolled student, prompt OPEN)
 *
 * Body: { promptId, answer }
 *
 * Tap = lock. The first answer wins: a retry, a double tap or a second device
 * gets { status: 'duplicate' } with the answer already locked, even after the
 * prompt has closed, which is how the pad recovers from a network drop. An
 * answer arriving after CLOSE is refused with 409 PROMPT_NOT_OPEN.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStudent(caller);

    const parsed = parseSubmitRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });

    const result = await callPad<{ status: 'accepted' | 'duplicate'; answer: string; raw_answer: string; responded_at: string }>(
      padDb(),
      'pad_submit',
      { p_actor: caller.user.id, p_prompt: parsed.value.promptId, p_raw: parsed.value.answer },
    );
    if (result.status === 'accepted') {
      await hintPrompt(parsed.value.promptId, 'teacher', { throttleMs: TEACHER_HINT_THROTTLE_MS });
    }

    return padJson({
      status: result.status,
      answer: result.answer,
      rawAnswer: result.raw_answer,
      respondedAt: result.responded_at,
    });
  } catch (err) {
    return padErrorResponse(err, 'submit');
  }
}
