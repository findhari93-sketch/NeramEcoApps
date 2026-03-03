export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { markNotificationRead, markAllNotificationsRead } from '@neram/database';

// POST /api/notifications/mark-read - Mark one or all notifications as read
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationId, userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Validate userId is a valid UUID (Supabase user ID, not email)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(userId)) {
      return NextResponse.json(
        { error: 'userId must be a valid UUID (Supabase user ID)' },
        { status: 400 }
      );
    }

    if (notificationId) {
      // Mark single notification as read
      await markNotificationRead(notificationId, userId);
    } else {
      // Mark all notifications as read
      await markAllNotificationsRead(userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking notification(s) as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark notification(s) as read' },
      { status: 500 }
    );
  }
}