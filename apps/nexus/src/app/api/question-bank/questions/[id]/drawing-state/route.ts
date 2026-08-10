import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getStudentQBDrawingState } from '@neram/database';

import { describeError } from '@/lib/api-errors';

/**
 * Whether this student may see the model answer for this drawing, and what
 * they have done on it so far.
 *
 * The gate is decided here, on the server, and returned as one boolean. The
 * panel does not rebuild it from the pieces: a rule written twice is a rule
 * that eventually disagrees with itself, and the copy that leaks is the one
 * that shows a student the answer they were meant to earn.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;
    const classroomId = request.nextUrl.searchParams.get('classroom_id');

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const state = await getStudentQBDrawingState(questionId, access.caller.id);
    return NextResponse.json({ data: state }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB drawing state] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
