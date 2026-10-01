import { NextRequest } from 'next/server';
import { resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintSession, loadSessionMeta, padDb, rosterIds } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pad/sessions/:id/snapshot[?touch=1]
 *
 * The whole truth for one screen, fetched on open, on every Realtime hint, on
 * resume and as a safety poll. Clients render only what this returns; a hint
 * never carries state.
 *
 * Staff get the teacher snapshot (only the session teacher; counts are against
 * the classroom roster). Students get their own view: the newest prompt, their
 * own answer, and grading only after Reveal. touch=1 also records that the
 * student's pad is open, which the heartbeat does otherwise.
 *
 * Both snapshots first close a question whose time is up (pad_expire_due).
 * The read that did so tells every other screen, since none of them changed
 * anything themselves.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');
    const supabase = padDb();

    if (caller.role === 'staff') {
      const meta = await loadSessionMeta(params.id);
      if (!meta) throw new PadRefusal('NOT_FOUND');
      if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');

      const snapshot = await callPad(supabase, 'pad_teacher_snapshot', {
        p_actor: caller.user.id,
        p_session: params.id,
        p_roster: await rosterIds(meta.classroom_id, meta.batch_id),
      });
      if (snapshot.auto_closed === true) await hintSession(params.id, 'everyone');
      return padJson(snapshot);
    }

    const snapshot = await callPad(supabase, 'pad_student_snapshot', {
      p_actor: caller.user.id,
      p_session: params.id,
      p_touch: request.nextUrl.searchParams.get('touch') === '1',
    });
    if (snapshot.auto_closed === true) await hintSession(params.id, 'everyone');
    return padJson(snapshot);
  } catch (err) {
    return padErrorResponse(err, 'snapshot');
  }
}
