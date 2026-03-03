export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { markContactMessageAsRead, markContactMessageAsReplied } from '@neram/database';

// PATCH /api/messages/[id] - Update message status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, adminId } = body;

    if (!status || !['read', 'replied'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status. Must be "read" or "replied".' },
        { status: 400 }
      );
    }

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: 'adminId is required' },
        { status: 400 }
      );
    }

    if (status === 'read') {
      await markContactMessageAsRead(id, adminId);
    } else if (status === 'replied') {
      await markContactMessageAsReplied(id, adminId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating contact message:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update message' },
      { status: 500 }
    );
  }
}