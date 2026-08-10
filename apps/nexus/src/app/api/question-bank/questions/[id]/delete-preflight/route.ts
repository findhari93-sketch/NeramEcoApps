import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, preflightQBQuestionDelete } from '@neram/database';

import { describeError } from '@/lib/api-errors';

/**
 * What would be destroyed if this question were deleted permanently.
 *
 * Read-only, so the delete dialog can explain itself before a teacher presses
 * anything. Without it the only way to find out that a question sits inside a
 * paper students have already sat is to delete it and watch the scores move.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;
    const [preflight] = await preflightQBQuestionDelete([id]);

    if (!preflight) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    return NextResponse.json({ data: preflight }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
