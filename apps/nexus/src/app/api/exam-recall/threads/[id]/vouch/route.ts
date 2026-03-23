import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { toggleVouch } from '@neram/database/queries';

/**
 * POST /api/exam-recall/threads/[id]/vouch
 *
 * Toggle vouch on a version.
 * Body: { version_id }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { version_id } = body;

    if (!version_id) {
      return NextResponse.json({ error: 'Missing required field: version_id' }, { status: 400 });
    }

    const result = await toggleVouch(version_id, user.id);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle vouch';
    console.error('[exam-recall/threads/[id]/vouch] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
