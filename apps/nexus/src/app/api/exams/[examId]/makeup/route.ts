import { NextRequest, NextResponse } from 'next/server';
import { grantExamMakeup, revokeExamMakeup, listExamMakeups } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * A second door for a genuine absentee.
 *
 * An exam closes hard, which is the point, so the only humane way to handle
 * illness or a power cut is an explicit, audited per-student window. Every
 * grant records who opened it and why.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const makeups = await listExamMakeups(params.examId);
    return NextResponse.json({ data: { makeups } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Makeup API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    if (!body?.opens_at || !body?.closes_at) {
      return NextResponse.json({ error: 'A makeup needs its own window' }, { status: 400 });
    }

    const makeup = await grantExamMakeup({
      examId: params.examId,
      studentId,
      opensAt: body.opens_at,
      closesAt: body.closes_at,
      reason: typeof body?.reason === 'string' ? body.reason : null,
      grantedBy: access.caller.id,
    });

    // Telling them is the point of granting it. Best-effort: a delivery failure
    // must not roll back a window the teacher has already decided to give.
    try {
      const opens = new Date(makeup.opens_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const closes = new Date(makeup.closes_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      await sendNudge({
        studentIds: [studentId],
        subject: `You can now sit ${access.exam.title || 'the exam'}`,
        plain: `Your teacher has opened a second window for ${access.exam.title || 'the exam'}. It runs from ${opens} to ${closes}. You get one attempt.`,
        eventType: 'exam_makeup_granted',
        metadata: { exam_id: params.examId, class_id: access.exam.scheduled_class_id },
      });
    } catch (err) {
      console.error('[Exam Makeup API] could not notify the student:', err);
    }

    return NextResponse.json({ data: { makeup } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Makeup API] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const studentId = new URL(request.url).searchParams.get('student_id');
    if (!studentId) return NextResponse.json({ error: 'Which student?' }, { status: 400 });

    await revokeExamMakeup(params.examId, studentId);
    return NextResponse.json({ data: { revoked: true } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Makeup API] DELETE Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
