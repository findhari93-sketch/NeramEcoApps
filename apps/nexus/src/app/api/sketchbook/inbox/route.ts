import { NextRequest, NextResponse } from 'next/server';
import { listUnflipped, loadClassroomRoster } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';

const PAGE = 20;

/**
 * GET /api/sketchbook/inbox?classroom=<id>   (staff)
 *
 * Sketches this teacher has not flipped through yet, newest first, from the
 * students in the classrooms they teach (or the one classroom asked for).
 * Dormant students are included: they keep uploading, and a teacher who opens
 * the inbox should see what arrived, not a filtered version of it.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const mine = await staffClassroomIds(caller);
    const asked = request.nextUrl.searchParams.get('classroom');
    if (asked && !mine.includes(asked)) throw new ApiError('You do not teach this classroom.', 403);
    const classroomIds = asked ? [asked] : mine;

    const rosters = await Promise.all(classroomIds.map((id) => loadClassroomRoster(id, { includeDormant: true })));
    const studentIds = [...new Set(rosters.flatMap((r) => r.members.map((m) => m.user_id)))];

    const { rows, remaining } = await listUnflipped(caller.id, studentIds, PAGE);
    return NextResponse.json({ sketches: rows, remaining }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the inbox');
  }
}
