import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  markUserNotificationRead,
  markAllUserNotificationsRead,
} from '@neram/database';

/**
 * POST /api/notifications/mark-read
 * Body: { notificationId?: string }
 *   - With notificationId: marks that single notification as read
 *   - Without notificationId: marks all as read
 *
 * Auth: Microsoft token in Authorization: Bearer <token>
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { notificationId } = body;

    if (notificationId) {
      await markUserNotificationRead(notificationId, user.id, supabase);
    } else {
      await markAllUserNotificationsRead(user.id, supabase);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Mark-read error:', err);
    return NextResponse.json(
      { error: 'Failed to mark notification(s) as read' },
      { status: 500 }
    );
  }
}
