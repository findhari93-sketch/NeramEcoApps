export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { listNotificationRecipients, createNotificationRecipient } from '@neram/database';

// GET /api/notifications/recipients - List notification recipients
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');

    const options: { isActive?: boolean } = {};
    if (isActive !== null) {
      options.isActive = isActive === 'true';
    }

    const data = await listNotificationRecipients(options);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing notification recipients:', error);
    return NextResponse.json(
      { error: 'Failed to list notification recipients' },
      { status: 500 }
    );
  }
}

// POST /api/notifications/recipients - Create a notification recipient
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, role, notification_preferences, added_by } = body;

    if (!email || !name) {
      return NextResponse.json(
        { error: 'email and name are required' },
        { status: 400 }
      );
    }

    const data = await createNotificationRecipient({
      email,
      name,
      role: role || 'team_member',
      notification_preferences: notification_preferences || undefined,
      added_by: added_by || undefined,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating notification recipient:', error);
    return NextResponse.json(
      { error: 'Failed to create notification recipient' },
      { status: 500 }
    );
  }
}