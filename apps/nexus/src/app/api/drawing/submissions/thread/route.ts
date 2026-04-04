import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getDrawingThread } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const questionId = request.nextUrl.searchParams.get('question_id');

    if (!questionId) {
      return NextResponse.json({ error: 'Missing question_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const thread = await getDrawingThread(user.id, questionId);
    return NextResponse.json({ thread });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load thread';
    console.error('Thread GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
