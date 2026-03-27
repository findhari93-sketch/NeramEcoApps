import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { markBadgesNotified } from '@neram/database/queries/nexus';

/**
 * POST /api/gamification/notifications/mark-read
 *
 * Marks badge awards as notified.
 * Body: { badge_ids: string[] }
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { badge_ids } = body;

    if (!Array.isArray(badge_ids) || badge_ids.length === 0) {
      return NextResponse.json({ error: 'badge_ids array required' }, { status: 400 });
    }

    await markBadgesNotified(user.id, badge_ids);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark notifications';
    console.error('Mark read error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
