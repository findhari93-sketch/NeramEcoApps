import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  mergeHindiIntoQuestions,
} from '@neram/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
    console.error('[Merge Hindi API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
