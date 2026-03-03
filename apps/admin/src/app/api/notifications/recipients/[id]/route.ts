export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { updateNotificationRecipient, deactivateNotificationRecipient } from '@neram/database';

// PUT /api/notifications/recipients/[id] - Update a notification recipient
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data = await updateNotificationRecipient(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating notification recipient:', error);
    return NextResponse.json(
      { error: 'Failed to update notification recipient' },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications/recipients/[id] - Deactivate a notification recipient (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deactivateNotificationRecipient(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deactivating notification recipient:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate notification recipient' },
      { status: 500 }
    );
  }
}