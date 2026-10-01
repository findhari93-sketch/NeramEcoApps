import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { checkSessionPresenters } from '@/lib/pad/meeting-presenters';
import { PadRefusal, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { loadSessionMeta } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';

async function sessionTeacher(request: NextRequest, id: string) {
  const caller = await resolvePadCaller(request.headers.get('Authorization'));
  assertPadStaff(caller);
  if (!isUuid(id)) throw new PadRefusal('NOT_FOUND');
  const meta = await loadSessionMeta(id.toLowerCase());
  if (!meta) throw new PadRefusal('NOT_FOUND');
  if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');
  return meta;
}

/**
 * GET /api/pad/sessions/:id/presenters  (session teacher)
 *
 * { state: 'locked' | 'open' | 'unknown', allowedPresenters, canFix }.
 * 'open' means students can present in this meeting, so one press of Teams'
 * Share replaces the teacher's screen share. 'unknown' means the meeting could
 * not be read (no Nexus class, or Graph refused), and the console shows the
 * manual path in Teams' Meeting options instead of a button.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const meta = await sessionTeacher(request, params.id);
    return padJson(await checkSessionPresenters(meta.id));
  } catch (err) {
    return padErrorResponse(err, 'presenter check');
  }
}

/**
 * POST /api/pad/sessions/:id/presenters  (session teacher)
 *
 * Sets the meeting's "Who can present" to the organizer only, then answers the
 * same shape as GET, read back from Teams.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const meta = await sessionTeacher(request, params.id);
    return padJson(await checkSessionPresenters(meta.id, { lock: true }));
  } catch (err) {
    return padErrorResponse(err, 'presenter lock');
  }
}
