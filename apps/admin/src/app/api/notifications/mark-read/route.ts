// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { markNotificationRead, markAllNotificationsRead } from '@neram/database';

// POST /api/notifications/mark-read - Mark one or all notifications as read
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationId, userId } = body;

    // userId is optional — use null as fallback (read_by is UUID type)
    const readBy = userId || null;

    // Validate userId is a valid UUID if provided (Supabase user ID, not email)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (userId && !UUID_REGEX.test(userId)) {
      return NextResponse.json(
        { error: 'userId must be a valid UUID (Supabase user ID)' },
        { status: 400 }
      );
    }

    if (notificationId) {
      await markNotificationRead(notificationId, readBy);
    } else {
      await markAllNotificationsRead(readBy);
    }
    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    console.error('Error marking notification(s) as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark notification(s) as read' },
      { status: 500 }
    );
  }
}