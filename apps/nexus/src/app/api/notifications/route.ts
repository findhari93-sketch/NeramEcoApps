import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { httpStatusForError } from '@/lib/api-errors';
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

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    // Only PGRST116 (no row) is "not found". A failed lookup leaves `data` null too,
    // and answering 404 for it hid timeouts behind a "User not found".
    if (userError && userError.code !== 'PGRST116') {
      throw new Error(`users lookup failed: ${userError.code ?? ''} ${userError.message}`);
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get('countOnly') === 'true';

    if (countOnly) {
      const count = await getUserUnreadNotificationCount(user.id, supabase);
      // private: this is one user's count and must never enter a shared cache.
      // max-age lets the browser absorb a duplicate poll without a round trip.
      return NextResponse.json(
        { count },
        { headers: { 'Cache-Control': 'private, max-age=30' } }
      );
    }

    const limit = parseInt(searchParams.get('limit') || '15');
    const offset = parseInt(searchParams.get('offset') || '0');
    const data = await listUserNotifications(user.id, { limit, offset }, supabase);

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Notifications GET error:', err);
    // 401 for a missing or rejected token, so the poller can tell "signed out"
    // from "server trouble"; everything else stays a 500.
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: httpStatusForError(err) }
    );
  }
}
