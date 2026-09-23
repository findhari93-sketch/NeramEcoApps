import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
import { revealQBDrawingSolution, type QBDrawingHelp } from '@neram/database';

import { describeError } from '@/lib/api-errors';

/**
 * The student chose to see the model answer without drawing first.
 *
 * Recorded rather than refused. Copying a good drawing is a real way to learn
 * drawing, so the escape hatch stays open; it is simply not silent. The row it
 * writes keeps the solution unlocked on later visits and marks any attempt the
 * student uploads afterwards, so a teacher marking it knows they had seen the
 * answer.
 *
 * Two kinds of help, one route. `kind: 'solution'` is the teacher's model
 * answer; `kind: 'peers'` is what classmates drew. `part` names one option of
 * an "attempt any one of N" drawing, so opening 81B's solution leaves 81A shut.
 *
 * Not classroom scoped: the row it writes is keyed on the student and the
 * question, nothing else. See the note in drawing-state/route.ts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;
    const body = await request.json().catch(() => ({}));
    const { part, kind } = body as { part?: string | null; kind?: string | null };

    if (kind != null && kind !== 'solution' && kind !== 'peers') {
      return NextResponse.json({ error: 'kind must be solution or peers' }, { status: 400 });
    }

    const access = await verifyQBAccessAnyClassroom(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const result = await revealQBDrawingSolution(questionId, access.caller.id, {
      partId: part || '',
      kind: (kind as QBDrawingHelp | null) || 'solution',
    });
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB drawing reveal] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
