import { NextRequest } from 'next/server';
import { resolvePadCaller } from '@/lib/pad/caller';
import { padErrorResponse, padJson } from '@/lib/pad/rpc';
import { padDb } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';

interface LiveSessionRef {
  id: string;
  classroom_id: string;
  classroom_name: string | null;
  meeting_id: string | null;
  room_code: string;
  round_no: number | null;
  created_at: string;
}

/** The teacher's live session, if any: a teacher has at most one. */
async function liveSessionOf(teacherId: string): Promise<LiveSessionRef | null> {
  const { data, error } = await padDb()
    .from('pad_sessions')
    .select('id, classroom_id, meeting_id, room_code, round_no, created_at, nexus_classrooms(name)')
    .eq('teacher_id', teacherId)
    .eq('status', 'live')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { nexus_classrooms: classroom, ...row } = data as LiveSessionRef & { nexus_classrooms: { name: string | null } | null };
  return { ...row, classroom_name: classroom?.name ?? null };
}

/**
 * GET /api/pad/me
 *
 * Which Answer Pad screen this person gets: the teacher console or the student
 * pad. The Teams side panel is one URL for everyone, so it asks here first.
 * 404 while the Answer Pad is switched off for their surface, like every other
 * pad route.
 *
 * For staff it also names their live session, so Present to class (a browser
 * window outside the meeting) attaches to the pad the teacher opened in Teams.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    const liveSession = caller.role === 'staff' ? await liveSessionOf(caller.user.id) : null;
    return padJson({ role: caller.role, name: caller.user.name ?? null, liveSession });
  } catch (err) {
    return padErrorResponse(err, 'me');
  }
}
