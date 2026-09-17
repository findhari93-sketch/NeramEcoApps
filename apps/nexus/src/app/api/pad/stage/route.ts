import { NextRequest } from 'next/server';
import { resolvePadCaller } from '@/lib/pad/caller';
import type { TeacherSnapshot } from '@/lib/pad/client/types';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { liveSessionForMeeting, loadSessionMeta, padDb, rosterIds } from '@/lib/pad/sessions';
import { stageView } from '@/lib/pad/stage';
import { stageAllowed, stageViews } from '@/lib/pad/stage-cache';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pad/stage?meetingId=<Teams meeting id>
 *
 * What the meeting screen shows when the teacher shares the Answer Pad to it:
 * the live session in this meeting, as class-level results only
 * (lib/pad/stage.ts). The session teacher and students enrolled in its
 * classroom may read it, the same people who may read its snapshots.
 *
 * 200 { stage: StageView | null }   null while no session is live in the meeting
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    const meetingId = request.nextUrl.searchParams.get('meetingId') ?? '';
    if (!meetingId || meetingId.length > 512) throw new PadRefusal('INVALID_INPUT', { field: 'meetingId' });

    const sessionId = await liveSessionForMeeting(meetingId);
    const meta = sessionId ? await loadSessionMeta(sessionId) : null;
    if (!sessionId || !meta) return padJson({ stage: null });

    const supabase = padDb();
    if (caller.role === 'staff') {
      if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');
    } else {
      const key = `${caller.user.id}:${sessionId}`;
      if (!stageAllowed.get(key)) {
        // The student snapshot checks enrollment in the session's classroom and refuses anyone else.
        await callPad(supabase, 'pad_student_snapshot', { p_actor: caller.user.id, p_session: sessionId, p_touch: false });
        stageAllowed.set(key, true);
      }
    }

    let view = stageViews.get(sessionId);
    if (!view) {
      const snapshot = (await callPad(supabase, 'pad_teacher_snapshot', {
        p_actor: meta.teacher_id,
        p_session: sessionId,
        p_roster: await rosterIds(meta.classroom_id, meta.batch_id),
      })) as unknown as TeacherSnapshot;
      view = stageView(snapshot);
      stageViews.set(sessionId, view);
    }
    return padJson({ stage: view });
  } catch (err) {
    return padErrorResponse(err, 'stage');
  }
}
