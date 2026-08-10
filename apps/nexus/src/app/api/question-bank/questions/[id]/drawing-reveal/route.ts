import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { revealQBDrawingSolution } from '@neram/database';

import { describeError } from '@/lib/api-errors';

/**
 * The student chose to see the model answer without drawing first.
 *
 * Recorded rather than refused. Copying a good drawing is a real way to learn
 * drawing, so the escape hatch stays open; it is simply not silent. The row it
 * writes keeps the solution unlocked on later visits and marks any attempt the
 * student uploads afterwards, so a teacher marking it knows they had seen the
 * answer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;
    const body = await request.json().catch(() => ({}));
    const classroomId = (body as { classroom_id?: string | null }).classroom_id ?? null;

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const result = await revealQBDrawingSolution(questionId, access.caller.id);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB drawing reveal] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
