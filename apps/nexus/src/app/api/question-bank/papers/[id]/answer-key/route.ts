import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  applyAnswerKey,
} from '@neram/database';
import type { NexusQBAnswerKeyEntry } from '@neram/database';

import { describeError } from '@/lib/api-errors';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const body = await request.json();
    const { answers } = body as { answers: NexusQBAnswerKeyEntry[] };

    if (!answers?.length) {
      return NextResponse.json({ error: 'No answers provided' }, { status: 400 });
    }

    const result = await applyAnswerKey(params.id, answers);

    return NextResponse.json({
      data: result,
      message: `${result.updated} answers applied${result.errors.length ? `, ${result.errors.length} errors` : ''}`,
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Answer Key API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
