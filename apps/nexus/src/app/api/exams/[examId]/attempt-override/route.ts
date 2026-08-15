import { NextRequest, NextResponse } from 'next/server';
import { grantExamAttemptOverride } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * POST /api/exams/[examId]/attempt-override
 * Body: { student_id }
 *
 * One teacher click from the invigilation roster grants one more attempt to
 * a student who has used up gating.attempt_limit on this exam. No
 * student-initiated request flow: the roster already shows who is exhausted,
 * so the teacher acts directly rather than waiting on a request to arrive.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const studentId = typeof body?.student_id === 'string' ? body.student_id : '';
    if (!studentId) return NextResponse.json({ error: 'Which student?' }, { status: 400 });

    const override = await grantExamAttemptOverride(params.examId, studentId, access.caller.id);

    // Telling them is the point of granting it. Best-effort, same reasoning
    // as the makeup grant next door: a delivery failure must not roll back an
    // attempt the teacher has already decided to give.
    try {
      await sendNudge({
        studentIds: [studentId],
        subject: `You have another attempt at ${access.exam.title || 'the test'}`,
        plain: `Your teacher has given you one more attempt at ${access.exam.title || 'the test'}. Open it from your Tests tab to try again.`,
        eventType: 'exam_attempt_override_granted',
        metadata: { exam_id: params.examId, class_id: access.exam.scheduled_class_id },
      });
    } catch (err) {
      console.error('[Exam Attempt Override API] could not notify the student:', err);
    }

    return NextResponse.json({ data: { override } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Attempt Override API] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
