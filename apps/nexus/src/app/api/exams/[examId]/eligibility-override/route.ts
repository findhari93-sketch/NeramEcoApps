import { NextRequest, NextResponse } from 'next/server';
import { setExamEligibilityOverride, clearExamEligibilityOverride } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * POST /api/exams/[examId]/eligibility-override
 * body { student_id, override: 'mandatory' | 'excused', note? }
 *
 * DELETE /api/exams/[examId]/eligibility-override?student_id=...
 *
 * One teacher decision on one student, always winning the final bucket over
 * whatever the automatic attendance/catch-up read decided -- see
 * exam-eligibility-roster.ts for how the override overlay works.
 */
export async function POST(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const studentId = typeof body?.student_id === 'string' ? body.student_id : '';
    const override = body?.override === 'mandatory' || body?.override === 'excused' ? body.override : null;
    if (!studentId) return NextResponse.json({ error: 'Which student?' }, { status: 400 });
    if (!override) return NextResponse.json({ error: 'override must be "mandatory" or "excused"' }, { status: 400 });

    const note = typeof body?.note === 'string' ? body.note : null;
    const result = await setExamEligibilityOverride(params.examId, studentId, override, note, access.caller.id);

    // Best-effort, same reasoning as the makeup and attempt-override routes
    // next door: a delivery failure must not roll back a decision the
    // teacher has already made.
    try {
      const subject =
        override === 'mandatory'
          ? `${access.exam.title || 'A test'} is required for you`
          : `You are excused from ${access.exam.title || 'this test'}`;
      const plain =
        override === 'mandatory'
          ? `Your teacher has marked ${access.exam.title || 'this test'} as required for you.`
          : `Your teacher has excused you from ${access.exam.title || 'this test'}.`;
      await sendNudge({
        studentIds: [studentId],
        subject,
        plain,
        eventType: 'exam_eligibility_override_set',
        metadata: { exam_id: params.examId, override },
      });
    } catch (err) {
      console.error('[Exam Eligibility Override API] could not notify the student:', err);
    }

    return NextResponse.json({ data: { override: result } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Eligibility Override API] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const studentId = new URL(request.url).searchParams.get('student_id');
    if (!studentId) return NextResponse.json({ error: 'Which student?' }, { status: 400 });

    await clearExamEligibilityOverride(params.examId, studentId);
    return NextResponse.json({ data: { cleared: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Eligibility Override API] DELETE Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
