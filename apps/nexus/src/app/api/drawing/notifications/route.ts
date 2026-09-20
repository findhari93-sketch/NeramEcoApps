export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { describeError, errorResponse } from '@/lib/api-errors';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/drawing/notifications
 * Returns unread drawing re-review notifications for the authenticated student.
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

    const { data: notifications } = await supabase
      .from('drawing_notifications')
      .select('id, submission_id, message, created_at')
      .eq('student_id', user.id)
      .eq('read', false)
      .order('created_at', { ascending: false });

    return NextResponse.json({ notifications: notifications || [] });
  } catch (err: any) {
    console.error('Drawing notifications GET error:', describeError(err));
    return errorResponse(err, 'Failed to load notifications');
  }
}

/**
 * PATCH /api/drawing/notifications
 * Mark a drawing notification as read.
 *
 * Body: { notification_id: string }
 * Auth: Microsoft token in Authorization: Bearer <token>
 */
export async function PATCH(request: NextRequest) {
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

    const { notification_id } = await request.json();
    if (!notification_id) {
      return NextResponse.json({ error: 'notification_id is required' }, { status: 400 });
    }

    await supabase
      .from('drawing_notifications')
      .update({ read: true })
      .eq('id', notification_id)
      .eq('student_id', user.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Drawing notifications PATCH error:', describeError(err));
    return errorResponse(err, 'Failed to mark notification read');
  }
}
