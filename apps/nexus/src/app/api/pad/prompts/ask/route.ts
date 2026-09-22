import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { promptTitle } from '@/lib/pad/client/format';
import { noticeForAsk } from '@/lib/pad/notify-session';
import { parseAskRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { hintSession, padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/prompts/ask  (session teacher)
 *
 * Body: { sessionId, answerType?: 'mcq' | 'numeric' | 'text' | 'yesno', optionCount?: 2..6,
 *         label?: string, text?: string, imageUrl?: string, optionTexts?: Array<string | null> }
 *
 * Opens a new prompt: an answer slot for the question the teacher is speaking
 * or showing, with the teacher's optional reference ("38", so every screen says
 * Q.38 as the paper does), optional question text, an optional picture uploaded
 * through /api/pad/sessions/:id/image, and optional text for each option. A repeated ASK (a double
 * tap, a retry) answers with the prompt already open and { changed: false }. An
 * earlier prompt that is CLOSED without a key does not block the next ASK: its
 * answer is decided later, during the class or from the class report.
 *
 * A new prompt also sends "Q.38 is open" into the meeting for students
 * without the pad open, when the bot is in the meeting. That is best effort and
 * waits at most a few seconds, so it can never fail or stall the ASK.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);

    const parsed = parseAskRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });
    const { sessionId, answerType, optionCount, label, text, imageUrl, optionTexts } = parsed.value;

    const asked = await callPad<{
      changed: boolean;
      prompt_id: string;
      state: string;
      version: number;
      sequence: number;
      label: string | null;
    }>(padDb(), 'pad_ask', {
      p_actor: caller.user.id,
      p_session: sessionId,
      p_answer_type: answerType,
      p_option_count: optionCount,
      p_label: label,
      p_text: text,
      p_image_url: imageUrl,
      p_option_texts: optionTexts,
    });
    if (asked.changed) {
      await hintSession(sessionId, 'everyone');
      await noticeForAsk(sessionId, promptTitle({ sequence: asked.sequence, label: asked.label }), request.nextUrl.origin);
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
