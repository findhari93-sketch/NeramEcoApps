import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  mergeHindiIntoQuestions,
} from '@neram/database';

import { describeError } from '@/lib/api-errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;
    const supabase = getSupabaseAdminClient();

    const { id: paperId } = await params;
    const body = await request.json();

    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json({ error: 'Missing or empty questions array' }, { status: 400 });
    }

    const result = await mergeHindiIntoQuestions(paperId, body.questions, supabase);

    return NextResponse.json({
      data: result,
      message: `${result.updated} questions updated with Hindi text`,
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Merge Hindi API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
