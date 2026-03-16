import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  applyAnswerKey,
} from '@neram/database';
import type { NexusQBAnswerKeyEntry } from '@neram/database';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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
    console.error('[Answer Key API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
