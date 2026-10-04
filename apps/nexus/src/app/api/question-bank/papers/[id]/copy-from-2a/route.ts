import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { copySharedSectionsFromPaper2A, Paper2BError } from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * Fill a JEE Paper 2B (B.Planning) paper's Maths and Aptitude from the Paper 2A
 * of the same sitting. The two papers share those questions word for word.
 *
 * Staff only. Safe to repeat: a section the 2B paper already has is skipped.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const data = await copySharedSectionsFromPaper2A(params.id, access.caller.id);
    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    if (err instanceof Paper2BError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Paper 2B copy API] Error:', describeError(err));
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
