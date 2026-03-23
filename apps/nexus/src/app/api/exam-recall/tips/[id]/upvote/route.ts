import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { upvoteTip } from '@neram/database/queries';

/**
 * POST /api/exam-recall/tips/[id]/upvote
 *
 * Upvote a tip (simple increment, no toggle).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const tip = await upvoteTip(id, user.id);

    return NextResponse.json(tip);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upvote tip';
    console.error('[exam-recall/tips/[id]/upvote] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
