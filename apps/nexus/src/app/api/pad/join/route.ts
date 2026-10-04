import { NextRequest } from 'next/server';
import { assertPadStudent, resolvePadCaller } from '@/lib/pad/caller';
import { clientIp, hashIp, normalizeRoomCode, padIpHashSecret } from '@/lib/pad/room-code';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { hintSession, padDb } from '@/lib/pad/sessions';

/** A class opening the pad together sends one hint a second at most; the console's poll catches the rest. */
const TEACHER_HINT_THROTTLE_MS = 1_000;

/**
 * POST /api/pad/join  (student, behind student.answer-pad)
 *
 * Body, one of:
 *   { meetingId }  from the Teams side panel: the live session for this meeting,
 *                  or { sessionId: null } while the teacher has not started yet
 *                  (the pad waits and asks again).
 *   { code }       from the /pad page: the six digits on the teacher's console.
 *
 * Neither the meeting nor the code grants anything. The database function
 * checks the signed-in student's enrollment in the session's classroom, and
 * failed codes are rate limited per student and per (hashed) IP.
 *
 * A student's first join in a round tells the teacher's console straight away,
 * so its "here" count moves when students open the pad, not only when they
 * answer.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStudent(caller);

    const raw = await request.json().catch(() => null);
    const body = (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const supabase = padDb();

    if (body.code !== undefined) {
      const code = normalizeRoomCode(body.code);
      if (!code) throw new PadRefusal('INVALID_INPUT', { field: 'code' });
      const joined = await callPad<{ session_id: string; first_touch?: boolean }>(supabase, 'pad_join_by_code', {
        p_actor: caller.user.id,
        p_code: code,
        p_ip_hash: hashIp(clientIp(request.headers), padIpHashSecret()),
      });
      if (joined.first_touch) await hintSession(joined.session_id, 'teacher', { throttleMs: TEACHER_HINT_THROTTLE_MS });
      return padJson({ sessionId: joined.session_id });
    }

    if (typeof body.meetingId === 'string' && body.meetingId.length > 0 && body.meetingId.length <= 512) {
      const joined = await callPad<{ session_id: string | null; first_touch?: boolean }>(supabase, 'pad_join_by_meeting', {
        p_actor: caller.user.id,
        p_meeting_id: body.meetingId,
      });
      if (joined.session_id && joined.first_touch) await hintSession(joined.session_id, 'teacher', { throttleMs: TEACHER_HINT_THROTTLE_MS });
      return padJson({ sessionId: joined.session_id });
    }

    throw new PadRefusal('INVALID_INPUT', { field: 'code' });
  } catch (err) {
    return padErrorResponse(err, 'join');
  }
}
