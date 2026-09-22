import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { promptTitle } from '@/lib/pad/client/format';
import { notifyQuestionOpen, questionPopupUrl } from '@/lib/pad/notify-session';
import { PadRefusal, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { loadSessionMeta, padDb } from '@/lib/pad/sessions';
import { TtlCache } from '@/lib/ttl-cache';

export const dynamic = 'force-dynamic';

/** One reminder per session per this long, however often the button is pressed. */
const RESEND_INTERVAL_MS = 20_000;
const lastReminder = new TtlCache<number>(RESEND_INTERVAL_MS, 1_000);

/**
 * POST /api/pad/sessions/:id/resend  (session teacher)
 *
 * "Remind students": the in-meeting notification again, for every student on
 * the class list who does not have the pad open (and is in the meeting, once the
 * bot has seen who is). It needs the bot in the meeting. At most one reminder
 * per session every 20 seconds on a server instance, so a worried double tap
 * does not buzz the class twice.
 *
 * 200 { recipients, sent, partial, failed, notConnected, skipped }
 *     skipped is 'no-meeting', 'no-bot' or 'nobody-to-remind' when nothing went out.
 * 409 SESSION_NOT_LIVE   429 RATE_LIMITED
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const meta = await loadSessionMeta(params.id);
    if (!meta) throw new PadRefusal('NOT_FOUND');
    if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');
    if (meta.status !== 'live') throw new PadRefusal('SESSION_NOT_LIVE');

    if (lastReminder.get(params.id)) throw new PadRefusal('RATE_LIMITED', { retryAfterSeconds: RESEND_INTERVAL_MS / 1000 });
    lastReminder.set(params.id, Date.now());

    const { data: prompt, error } = await padDb()
      .from('pad_prompts')
      .select('sequence, label, state')
      .eq('session_id', params.id)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const title = prompt?.state === 'open' ? `${promptTitle(prompt)} is open` : 'Open the Answer Pad';
    const notice = await notifyQuestionOpen(params.id, { title, padUrl: questionPopupUrl(request.nextUrl.origin) });
    return padJson({ ...notice.delivery, notConnected: notice.notConnected, skipped: notice.skipped });
  } catch (err) {
    return padErrorResponse(err, 'resend');
  }
}
