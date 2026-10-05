import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { moveQuestionsToPaper2B, Paper2BError } from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * Move Planning questions that were uploaded into a JEE Paper 2A (B.Arch) paper
 * to the JEE Paper 2B (B.Planning) paper of the same sitting. The 2B paper is
 * created when missing and given the shared Maths and Aptitude.
 *
 * Body: { question_ids: string[] }. Staff only.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.question_ids)
      ? body.question_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Pick at least one question to move' }, { status: 400 });
    }

    const data = await moveQuestionsToPaper2B(params.id, ids, access.caller.id);
    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    if (err instanceof Paper2BError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Paper 2B move API] Error:', describeError(err));
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
