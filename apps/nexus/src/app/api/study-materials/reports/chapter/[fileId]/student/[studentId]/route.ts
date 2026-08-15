import { NextRequest, NextResponse } from 'next/server';
import { getStudyFileAttemptReview } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * GET /api/study-materials/reports/chapter/[fileId]/student/[studentId]  (staff)
 *
 * One student's full response sheet for a chapter test: every submitted
 * attempt, replayed question by question (their answer, the correct one,
 * whether it was right, the explanation). Previously the only number a
 * teacher could see for a student was a single best score.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string; studentId: string } },
) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const data = await getStudyFileAttemptReview(params.fileId, params.studentId);
    if (!data.test) {
      return NextResponse.json({ error: 'No test attached to this chapter' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the response sheet';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
