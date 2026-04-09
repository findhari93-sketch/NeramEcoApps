// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, getSupabaseAdminClient } from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: getCorsHeaders(request.headers.get('Origin')) });
}

/**
 * GET /api/drawing/notifications
 * Returns unread drawing re-review notifications for the authenticated student.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('Origin'));
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const decodedToken = await verifyIdToken(authHeader.slice(7));
    const supabase = getSupabaseAdminClient();
    const user = await getUserByFirebaseUid(decodedToken.uid);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders });
    }

    const { data: notifications } = await (supabase as any)
      .from('drawing_notifications')
      .select('id, submission_id, message, created_at')
      .eq('student_id', user.id)
      .eq('read', false)
      .order('created_at', { ascending: false });

    return NextResponse.json({ notifications: notifications || [] }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('Drawing notifications GET error:', err);
    return NextResponse.json(
      { error: 'Failed to load notifications' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * PATCH /api/drawing/notifications
 * Mark a drawing notification as read.
 *
 * Body: { notification_id: string }
 * Auth: Firebase ID token in Authorization: Bearer <token>
 */
export async function PATCH(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('Origin'));
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const decodedToken = await verifyIdToken(authHeader.slice(7));

    const { notification_id } = await request.json();
    if (!notification_id) {
      return NextResponse.json({ error: 'notification_id is required' }, { status: 400, headers: corsHeaders });
    }

    const supabase = getSupabaseAdminClient();
    const user = await getUserByFirebaseUid(decodedToken.uid);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders });

    await (supabase as any)
      .from('drawing_notifications')
      .update({ read: true })
      .eq('id', notification_id)
      .eq('student_id', user.id);

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('Drawing notifications PATCH error:', err);
    return NextResponse.json(
      { error: 'Failed to mark notification read' },
      { status: 500, headers: corsHeaders }
    );
  }
}
