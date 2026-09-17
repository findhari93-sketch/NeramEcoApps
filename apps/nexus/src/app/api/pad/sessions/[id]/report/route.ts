import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { loadSessionMeta, padDb, rosterIds } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pad/sessions/:id/report  (session teacher)
 *
 * The class report: every prompt with its counts, and one row per student on
 * the class list (plus anyone who answered without being on it) with answered,
 * silent and absent counts and the score: correct out of the revealed, graded
 * questions they were there for. A prompt still OPEN has no counts yet.
 *
 * The report page builds its CSV from this same answer, so the table and the
 * download can never disagree.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const meta = await loadSessionMeta(params.id);
    if (!meta) throw new PadRefusal('NOT_FOUND');
    // Before loading anyone's roster.
    if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');

    const report = await callPad(padDb(), 'pad_session_report', {
      p_actor: caller.user.id,
      p_session: params.id,
      p_roster: await rosterIds(meta.classroom_id, meta.batch_id),
    });
    return padJson(report);
  } catch (err) {
    return padErrorResponse(err, 'report');
  }
}
