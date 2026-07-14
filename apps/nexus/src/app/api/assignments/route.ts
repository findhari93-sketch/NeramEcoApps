import { NextRequest, NextResponse } from 'next/server';
import { listAssignmentsForClassroom } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/assignments?classroom=<id>[&status=draft|published|closed]  (staff)
 * Classroom-anchored assignment list for the Assignments hub, newest class first,
 * each with attachment + submission counts.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    const status = request.nextUrl.searchParams.get('status') as
      | 'draft'
      | 'published'
      | 'closed'
      | null;
    const assignments = await listAssignmentsForClassroom(
      classroomId,
      status ? { status } : undefined,
    );
    return NextResponse.json({ assignments });
  } catch (err) {
    return errorResponse(err, 'Failed to load assignments');
  }
}
