import { NextRequest, NextResponse } from 'next/server';
import { getAssignmentEngagement } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/assignments/engagement?classroom=<id>  (staff)
 * Per active non-alumni student, their standing across all published assignments
 * of the classroom, judged on each student's personal clock. Powers the overall
 * Active / Partial / Inactive tracking dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    const data = await getAssignmentEngagement(classroomId);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err, 'Failed to load engagement');
  }
}
