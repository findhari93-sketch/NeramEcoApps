import { NextRequest, NextResponse } from 'next/server';
import { cancelExam, updateExam, getExamPlacement } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';

/** Read, change or cancel one exam. */

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const placement = await getExamPlacement(params.examId);
    return NextResponse.json({ data: { exam: access.exam, placement } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const exam = await updateExam(params.examId, {
      title: typeof body?.title === 'string' ? body.title : undefined,
      opensAt: body?.opens_at ?? undefined,
      closesAt: body?.closes_at ?? undefined,
      durationMinutes: body?.duration_minutes ?? undefined,
      passingPct: body?.passing_pct ?? undefined,
      testId: typeof body?.test_id === 'string' ? body.test_id : undefined,
    });

    return NextResponse.json({ data: { exam } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam API] PATCH Error:', message);
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

    await cancelExam(params.examId);
    return NextResponse.json({ data: { cancelled: true } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam API] DELETE Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
