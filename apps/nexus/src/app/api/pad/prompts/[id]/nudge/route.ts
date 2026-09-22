import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { promptTitle } from '@/lib/pad/client/format';
import { padPublicOrigin } from '@/lib/pad/notify-session';
import { nudgeMessage } from '@/lib/pad/nudge-message';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintSession, loadPromptSessionId, loadSessionMeta, padDb, rosterIds, sessionRoomCode } from '@/lib/pad/sessions';
import { plainToHtmlWithLink, sendNudge } from '@/lib/nudge-delivery';

export const dynamic = 'force-dynamic';
/** Graph creates chats five at a time, so a class of forty closed pads takes a few seconds. */
export const maxDuration = 60;

/**
 * POST /api/pad/prompts/:id/nudge  (session teacher, prompt OPEN)
 *
 * One press for everyone on the class list who has neither answered nor said
 * why not. pad_nudge marks them and splits them by whether their pad is open:
 *   - pad open: a polite banner on their pad, on its next refresh;
 *   - pad closed: a Teams chat from the teacher (their connected Teams login;
 *     the pad's own sign-in token cannot post chats), with a link to the pad,
 *     and the Nexus bell. A student absent from class gets it too, and it reads
 *     as an invitation to join.
 * Once a minute per question at most, held by the database so every server
 * instance agrees (429 RATE_LIMITED { retry_after_seconds }).
 *
 * 200 { inPad, chat, chatDelivered }: counts only. Names never reach the
 * console while the question is open.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const caller = await resolvePadCaller(authHeader);
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');
    const promptId = params.id.toLowerCase();

    const sessionId = await loadPromptSessionId(promptId);
    const meta = sessionId ? await loadSessionMeta(sessionId) : null;
    if (!sessionId || !meta) throw new PadRefusal('NOT_FOUND');
    if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');

    const marked = await callPad<{ pad_open: string[]; pad_closed: string[] }>(padDb(), 'pad_nudge', {
      p_actor: caller.user.id,
      p_prompt: promptId,
      p_roster: await rosterIds(meta.classroom_id, meta.batch_id),
    });
    const inPad = Array.isArray(marked.pad_open) ? marked.pad_open : [];
    const closed = Array.isArray(marked.pad_closed) ? marked.pad_closed : [];

    // The banner rides on the pads' next snapshot; tell them to fetch it now.
    if (inPad.length > 0) await hintSession(sessionId, 'everyone');

    let chatDelivered = 0;
    if (closed.length > 0) {
      const [{ data: prompt, error }, roomCode] = await Promise.all([
        padDb().from('pad_prompts').select('sequence, label').eq('id', promptId).maybeSingle(),
        sessionRoomCode(sessionId),
      ]);
      if (error) throw error;
      const title = promptTitle(prompt ?? { sequence: 0, label: null });
      const { subject, plain } = nudgeMessage(title);
      const origin = padPublicOrigin(request.nextUrl.origin);
      const link = roomCode ? `${origin}/pad/r/${roomCode}` : `${origin}/pad`;
      const html = plainToHtmlWithLink(plain, link, 'Open the Answer Pad');

      const sent = await sendNudge({
        studentIds: closed,
        subject,
        plain,
        html,
        teamsText: subject,
        eventType: 'pad_nudge',
        metadata: { source: 'answer_pad', session_id: sessionId, prompt_id: promptId },
        sendAs: { senderUserId: caller.user.id, html },
        source: { kind: 'pad_prompt', refId: promptId },
      });
      chatDelivered = sent.counts.chat;
    }

    return padJson({ inPad: inPad.length, chat: closed.length, chatDelivered });
  } catch (err) {
    return padErrorResponse(err, 'nudge');
  }
}
