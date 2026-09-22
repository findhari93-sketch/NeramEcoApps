import { NextRequest } from 'next/server';
import { assertPadStudent, resolvePadCaller } from '@/lib/pad/caller';
import { parseSkipRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { hintPrompt, padDb } from '@/lib/pad/sessions';

/** Reasons arrive in a burst when a question is hard; the console needs one refetch, not twenty. */
const TEACHER_HINT_THROTTLE_MS = 1_000;

/**
 * POST /api/pad/skip  (enrolled student, prompt OPEN)
 *
 * Body: { promptId, reason: 'dont_know' | 'cant_see' | 'need_time' | 'tech_problem' | 'other' | null, note? }
 *
 * "I can't answer", and why. It never locks the student out: an answer given
 * afterwards counts, and the answer wins ({ status: 'answered' } if one is
 * already locked). null takes the reason back. The teacher sees how many gave
 * each reason while the question is open, and who only after it closes.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStudent(caller);

    const parsed = parseSkipRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });
    const { promptId, reason, note } = parsed.value;

    const result = await callPad<{ status: 'saved' | 'cleared' | 'answered'; reason?: string; note?: string | null }>(
      padDb(),
      'pad_set_skip_reason',
      { p_actor: caller.user.id, p_prompt: promptId, p_reason: reason, p_note: note },
    );
    if (result.status !== 'answered') {
      await hintPrompt(promptId, 'teacher', { throttleMs: TEACHER_HINT_THROTTLE_MS });
    }
    return padJson({ status: result.status, reason: result.reason ?? null, note: result.note ?? null });
  } catch (err) {
    return padErrorResponse(err, 'skip');
  }
}
