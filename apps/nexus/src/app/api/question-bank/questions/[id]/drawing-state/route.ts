import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
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
 *
 * Not classroom scoped, so verifyQBAccessAnyClassroom rather than
 * verifyQBAccess. What comes back is one student's own progress on one bank
 * question, and drawing_submissions has no classroom_id column to scope it by.
 * Asking the panel for a classroom it had no way to supply is what put
 * "classroom_id is required" on screen for every student (NXS-0114 again).
 *
 * `?part=` names one option of an "attempt any one of N" drawing. Each option
 * has its own mirror, its own thread and its own reveal, because in practice
 * they are two unrelated questions. Omitted means the whole question.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;

    const access = await verifyQBAccessAnyClassroom(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const partId = request.nextUrl.searchParams.get('part') || '';

    const state = await getStudentQBDrawingState(questionId, access.caller.id, { partId });
    return NextResponse.json({ data: state }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB drawing state] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
