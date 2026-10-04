import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { padDb } from '@/lib/pad/sessions';

/**
 * POST /api/pad/sessions/:id/title  (session teacher)
 *
 * Body: { title: string | null }
 *
 * The teacher's own name for the class, shown at the top of the console. An
 * empty title goes back to the timetable class, the Teams meeting's title or the
 * classroom, in that order. Answers { title } with the title now shown.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const body = await request.json().catch(() => null);
    const raw = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).title : undefined;
    if (raw !== null && typeof raw !== 'string') throw new PadRefusal('INVALID_INPUT', { field: 'title' });

    const result = await callPad<{ title: string | null }>(padDb(), 'pad_rename_session', {
      p_actor: caller.user.id,
      p_session: params.id,
      p_title: raw,
    });
    return padJson({ title: result.title });
  } catch (err) {
    return padErrorResponse(err, 'rename session');
  }
}
