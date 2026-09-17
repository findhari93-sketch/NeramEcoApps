import { NextRequest } from 'next/server';
import { assertPadStudent, resolvePadCaller } from '@/lib/pad/caller';
import { clientIp, hashIp, normalizeRoomCode, padIpHashSecret } from '@/lib/pad/room-code';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { padDb } from '@/lib/pad/sessions';

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
      const joined = await callPad<{ session_id: string }>(supabase, 'pad_join_by_code', {
        p_actor: caller.user.id,
        p_code: code,
        p_ip_hash: hashIp(clientIp(request.headers), padIpHashSecret()),
      });
      return padJson({ sessionId: joined.session_id });
    }

    if (typeof body.meetingId === 'string' && body.meetingId.length > 0 && body.meetingId.length <= 512) {
      const joined = await callPad<{ session_id: string | null }>(supabase, 'pad_join_by_meeting', {
        p_actor: caller.user.id,
        p_meeting_id: body.meetingId,
      });
      return padJson({ sessionId: joined.session_id });
    }

    throw new PadRefusal('INVALID_INPUT', { field: 'code' });
  } catch (err) {
    return padErrorResponse(err, 'join');
  }
}
