import { NextRequest, NextResponse } from 'next/server';
import { refuseUnlessStudent, verifyQBAccess } from '@/lib/qb-auth';
import { buildMistakesTest, getStudentMistakeQuestionIds } from '@neram/database';

/**
 * Practice what you got wrong.
 *
 * GET  -> how many questions are currently outstanding, so the button can say
 *         so honestly rather than leading to an empty paper.
 * POST -> compose a fresh paper from them and hand back its id.
 *
 * Regenerated every time rather than stored, so it shrinks as the student
 * improves and never shows a question they have since got right.
 */

export async function GET(request: NextRequest) {
  try {
    const classroomId = new URL(request.url).searchParams.get('classroom');
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const ids = await getStudentMistakeQuestionIds(access.caller.id, { limit: 50 });
    return NextResponse.json({ data: { count: ids.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check your mistakes';
    console.error('Mistakes GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const classroomId = typeof body?.classroom_id === 'string' ? body.classroom_id : null;
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    // POST composes a student_custom paper; GET above only counts, so it stays
    // open to staff previewing the student screen.
    const notAStudent = refuseUnlessStudent(access.caller);
    if (notAStudent) return notAStudent;

    const result = await buildMistakesTest({
      studentId: access.caller.id,
      classroomId,
      limit: Number(body?.limit) || 20,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Nothing to practise yet. Take a test first, and anything you miss shows up here.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build your practice test';
    console.error('Mistakes POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
