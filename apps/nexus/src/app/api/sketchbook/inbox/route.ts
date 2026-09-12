import { NextRequest, NextResponse } from 'next/server';
import { listUnflipped } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { staffStudentIds } from '@/lib/sketchbook-access';

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
    const asked = request.nextUrl.searchParams.get('classroom');
    const studentIds = await staffStudentIds(caller, asked);

    const { rows, remaining } = await listUnflipped(caller.id, studentIds, PAGE);
    return NextResponse.json({ sketches: rows, remaining }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the inbox');
  }
}
