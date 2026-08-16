import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { checkNewJoinerReschedule, computeRescheduleWindow, resolveStudentId } from '@/lib/exam-reschedule';

/**
 * GET /api/student/exams/[examId]/reschedule-options
 *
 * The self-serve reschedule path is for exactly one bucket: a student who
 * enrolled after the exam's covered class(es), and so was never expected to
 * be ready for it. Eligibility is RECOMPUTED here, never trusted from the
 * client, because the alternative is a student picking their own exam date
 * just by knowing which URL to POST to.
 *
 * Every other excused reason (still catching up, teacher-granted excuse)
 * routes through a teacher, not this endpoint -- see Phase 2 of the exam
 * eligibility plan for the approval inbox that bucket needs.
 */
export async function GET(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const studentId = await resolveStudentId(msUser.oid);
    if (!studentId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const check = await checkNewJoinerReschedule(params.examId, studentId);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

    return NextResponse.json({ data: { eligible: true, ...computeRescheduleWindow(check.exam) } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Student Reschedule Options API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
