import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getUnnotifiedBadges } from '@neram/database/queries/nexus';

/**
 * GET /api/gamification/notifications/unread
 *
 * Returns unnotified badge awards for the current user.
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const unread = await getUnnotifiedBadges(user.id);
    return NextResponse.json({ badges: unread });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load notifications';
    console.error('Unread notifications error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
