import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getUserUnreadNotificationCount,
  listUserNotifications,
} from '@neram/database';

/**
 * GET /api/notifications
 * Query params:
 *   ?countOnly=true  - Returns just the unread count (for polling)
 *   ?limit=15&offset=0 - Returns paginated notifications list
 *
 * Auth: Microsoft token in Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get('countOnly') === 'true';

    if (countOnly) {
      const count = await getUserUnreadNotificationCount(user.id, supabase);
      return NextResponse.json({ count });
    }

    const limit = parseInt(searchParams.get('limit') || '15');
    const offset = parseInt(searchParams.get('offset') || '0');
    const data = await listUserNotifications(user.id, { limit, offset }, supabase);

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Notifications GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
