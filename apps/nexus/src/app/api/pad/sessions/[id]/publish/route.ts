import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { padPublicOrigin } from '@/lib/pad/notify-session';
import { personaliseResults, resultMessage, type RoundResults } from '@/lib/pad/round-results';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintSession, loadSessionMeta, padDb, rosterIds } from '@/lib/pad/sessions';
import { stageViews } from '@/lib/pad/stage-cache';
import { storeRoundResults } from '@/lib/pad/store-results';
import { plainToHtmlWithLink, sendNudge } from '@/lib/nudge-delivery';

export const dynamic = 'force-dynamic';
/** Graph creates chats five at a time, so a class of forty takes a few seconds. */
export const maxDuration = 60;

/**
 * POST /api/pad/sessions/:id/publish  (session teacher, round ended)
 *
 * Body: { publish?: boolean }   false withdraws the results
 *
 * Publishes the round's results. Every student's pad then shows their own
 * result, the top five and the class average, and the meeting screen can show
 * the top five. The first time only, each student who joined gets their own
 * result in a Teams chat from Neram Assistant (with the teacher's name on it)
 * and on the Nexus bell. Publishing again after a late answer key updates what
 * they see without messaging them twice.
 *
 * 409 INVALID_TRANSITION while the round is still running.
 * 200 { publishedAt, notified }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');
    const sessionId = params.id.toLowerCase();

    const meta = await loadSessionMeta(sessionId);
    if (!meta) throw new PadRefusal('NOT_FOUND');
    if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');

    const body = await request.json().catch(() => null);
    const publish = !(body && typeof body === 'object' && (body as Record<string, unknown>).publish === false);
    const roster = await rosterIds(meta.classroom_id, meta.batch_id);

    const published = await callPad<{ published_at: string | null; notify: string[] }>(padDb(), 'pad_publish_results', {
      p_actor: caller.user.id,
      p_session: sessionId,
      p_roster: roster,
      p_publish: publish,
    });
    // What students now see is what the class record holds.
    if (publish) await storeRoundResults(sessionId, caller.user.id);
    // The meeting screen and every pad show the change on their next read.
    stageViews.delete(sessionId);
    stageViews.delete(`results:${sessionId}`);
    await hintSession(sessionId, 'everyone');

    let notified = 0;
    const recipients = Array.isArray(published.notify) ? published.notify : [];
    if (publish && recipients.length > 0) {
      const results = (await callPad(padDb(), 'pad_session_results', {
        p_actor: caller.user.id,
        p_session: sessionId,
        p_roster: roster,
      })) as unknown as RoundResults;
      const rows = results.students.filter((row) => recipients.includes(row.student_id));
      const { subject, plain } = resultMessage(results.session.round_no, results.session.classroom_name);
      const origin = padPublicOrigin(request.nextUrl.origin);
      const link = results.session.scheduled_class_id
        ? `${origin}/student/timetable?class=${results.session.scheduled_class_id}`
        : `${origin}/student/timetable`;
      const html = plainToHtmlWithLink(plain, link, 'See it in Nexus');

      if (rows.length > 0) {
        const sent = await sendNudge({
          studentIds: rows.map((row) => row.student_id),
          subject,
          plain,
          html,
          teamsText: subject,
          eventType: 'pad_result',
          metadata: { source: 'answer_pad', session_id: sessionId },
          sendAs: { senderUserId: caller.user.id, html },
          personalise: personaliseResults(rows),
          source: { kind: 'pad_session', refId: sessionId },
        });
        notified = sent.counts.total - sent.counts.unreached;
      }
      await callPad(padDb(), 'pad_mark_results_notified', { p_actor: caller.user.id, p_session: sessionId });
    }

    return padJson({ publishedAt: published.published_at, notified });
  } catch (err) {
    return padErrorResponse(err, 'publish results');
  }
}
