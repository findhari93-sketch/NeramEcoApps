import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { noticeForAsk } from '@/lib/pad/notify-session';
import { parseAskRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { hintSession, padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/prompts/ask  (session teacher)
 *
 * Body: { sessionId, answerType?: 'mcq' | 'numeric' | 'text' | 'yesno', optionCount?: 2..6 }
 *
 * Opens a new prompt: an anonymous answer slot for the question the teacher is
 * speaking or showing. A repeated ASK (a double tap, a retry) answers with the
 * prompt already open and { changed: false }. While the previous prompt is
 * CLOSED and not revealed, ASK is refused with 409 INVALID_TRANSITION.
 *
 * A new prompt also sends "Question N is open" into the meeting for students
 * without the pad open, when the bot is in the meeting. That is best effort and
 * waits at most a few seconds, so it can never fail or stall the ASK.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);

    const parsed = parseAskRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });
    const { sessionId, answerType, optionCount } = parsed.value;

    const asked = await callPad<{ changed: boolean; prompt_id: string; state: string; version: number; sequence: number }>(
      padDb(),
      'pad_ask',
      { p_actor: caller.user.id, p_session: sessionId, p_answer_type: answerType, p_option_count: optionCount },
    );
    if (asked.changed) {
      await hintSession(sessionId, 'everyone');
      await noticeForAsk(sessionId, asked.sequence, request.nextUrl.origin);
    }

    return padJson({
      promptId: asked.prompt_id,
      sequence: asked.sequence,
      state: asked.state,
      version: asked.version,
      changed: asked.changed,
    });
  } catch (err) {
    return padErrorResponse(err, 'ask');
  }
}
