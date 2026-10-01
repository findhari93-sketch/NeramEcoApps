import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import type { RoundResults } from '@/lib/pad/round-results';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { loadSessionMeta, padDb, rosterIds } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pad/sessions/:id/results  (session teacher)
 *
 * The round's results, computed now: class tiles, the top five, and every
 * student who joined, ranked by most correct (ties share a rank), with their
 * label and whether they were active. A late answer key or an accepted reason
 * shows up here at once; `changed_since_publish` says so after publishing.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');
    const sessionId = params.id.toLowerCase();

    const meta = await loadSessionMeta(sessionId);
    if (!meta) throw new PadRefusal('NOT_FOUND');
    if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');

    const results = await callPad(padDb(), 'pad_session_results', {
      p_actor: caller.user.id,
      p_session: sessionId,
      p_roster: await rosterIds(meta.classroom_id, meta.batch_id),
    });
    const { ok: _ok, ...body } = results as Record<string, unknown>;
    return padJson(body as unknown as RoundResults);
  } catch (err) {
    return padErrorResponse(err, 'round results');
  }
}
