import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getMyActivity } from '@neram/database/queries/nexus';

/**
 * GET /api/library/engagement/me
 *
 * Student's own activity summary.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const activity = await getMyActivity(user.id);

    return NextResponse.json({ data: activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load activity';
    console.error('My activity GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
