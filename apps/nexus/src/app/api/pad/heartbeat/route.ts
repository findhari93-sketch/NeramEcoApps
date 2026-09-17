import { NextRequest } from 'next/server';
import { assertPadStudent, resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/heartbeat  (student)
 *
 * Body: { sessionId }
 *
 * Sent every 30 seconds while the pad is open. It is what keeps a student who
 * has the pad open counted present when Teams never reports them joining, and
 * what the readiness line counts as "connected". Answers { status } so a pad
 * left open after the class notices the session has ended.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStudent(caller);

    const body = await request.json().catch(() => null);
    const sessionId = body && typeof body === 'object' ? (body as Record<string, unknown>).sessionId : undefined;
    if (!isUuid(sessionId)) throw new PadRefusal('INVALID_INPUT', { field: 'sessionId' });

    const result = await callPad<{ status: 'live' | 'ended' }>(padDb(), 'pad_heartbeat', {
      p_actor: caller.user.id,
      p_session: sessionId,
    });
    return padJson({ status: result.status });
  } catch (err) {
    return padErrorResponse(err, 'heartbeat');
  }
}
