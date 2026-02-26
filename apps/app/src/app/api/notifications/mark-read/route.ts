// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  markUserNotificationRead,
  markAllUserNotificationsRead,
} from '@neram/database';

import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/notifications/mark-read
 * Body: { notificationId?: string }
 *   - With notificationId: marks that single notification as read
 *   - Without notificationId: marks all as read
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>
 */
export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('Origin'));
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const idToken = authHeader.slice(7);
    const decodedToken = await verifyIdToken(idToken);

    const adminClient = getSupabaseAdminClient();
    const user = await getUserByFirebaseUid(decodedToken.uid, adminClient);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders });
    }

    const body = await request.json();
    const { notificationId } = body;

    if (notificationId) {
      await markUserNotificationRead(notificationId, user.id, adminClient);
    } else {
      await markAllUserNotificationsRead(user.id, adminClient);
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('Error marking notification(s) as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark notification(s) as read' },
      { status: 500, headers: corsHeaders }
    );
  }
}
