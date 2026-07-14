import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { gradeTestOneShot } from '@neram/database';

/**
 * POST /api/question-bank/tests/[id]/attempt
 * Unified one-shot grader: grade submitted answers against the bank, record the
 * attempt, and dispatch the placement's context side-effect (completion/gating).
 * Body: { answers: { [questionId]: 'a'|'b'|... }, placement_id? }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;

    const body = await request.json();
    const answers = body?.answers && typeof body.answers === 'object' ? body.answers : {};
    const placementId = typeof body?.placement_id === 'string' ? body.placement_id : null;

    const result = await gradeTestOneShot({
      testId: params.id,
      studentId: access.caller.id,
      answers,
      placementId,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit attempt';
    console.error('Unified attempt error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
