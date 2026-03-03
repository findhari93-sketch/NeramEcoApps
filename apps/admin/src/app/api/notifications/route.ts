export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { listAdminNotifications } from '@neram/database';

// GET /api/notifications - List admin notifications
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isRead = searchParams.get('isRead');
    const eventType = searchParams.get('eventType') || undefined;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const options: {
      isRead?: boolean;
      eventType?: any;
      limit?: number;
      offset?: number;
    } = { limit, offset };

    if (isRead !== null) {
      options.isRead = isRead === 'true';
    }
    if (eventType) {
      options.eventType = eventType;
    }

    const data = await listAdminNotifications(options);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error listing admin notifications:', error);
    return NextResponse.json(
      { error: 'Failed to list admin notifications' },
      { status: 500 }
    );
  }
}