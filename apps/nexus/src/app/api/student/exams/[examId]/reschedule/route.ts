import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { grantExamMakeup } from '@neram/database';
import { checkNewJoinerReschedule, computeRescheduleWindow, resolveStudentId } from '@/lib/exam-reschedule';

/**
 * POST /api/student/exams/[examId]/reschedule
 * body { date: 'YYYY-MM-DD' }
 *
 * Re-validates eligibility AGAIN (defense in depth -- never trust the
 * earlier GET), re-derives the allowed date range server-side, and only then
 * opens a makeup window. Upsert semantics on grantExamMakeup mean a student
 * can pick a different date before their window opens, same as a teacher
 * re-granting a makeup after a revoke.
 */
export async function POST(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const studentId = await resolveStudentId(msUser.oid);
    if (!studentId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const check = await checkNewJoinerReschedule(params.examId, studentId);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

    const body = await request.json().catch(() => ({}));
    const date = typeof body?.date === 'string' ? body.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Pick a date' }, { status: 400 });
    }

    const window = computeRescheduleWindow(check.exam);
    if (date < window.min_date || date > window.max_date) {
      return NextResponse.json({ error: 'That date is outside the allowed range' }, { status: 400 });
    }

    const opensAt = `${date}T${window.start_time}:00+05:30`;
    const closesAt = `${date}T${window.end_time}:00+05:30`;

    const makeup = await grantExamMakeup({
      examId: params.examId,
      studentId,
      opensAt,
      closesAt,
      reason: 'Self-serve reschedule: enrolled after this test\'s covered class(es).',
      grantedBy: studentId,
      source: 'self_serve_new_joiner',
    });

    return NextResponse.json({ data: { makeup } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Student Reschedule API] Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
