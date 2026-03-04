// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateNataAnnouncement, deleteNataAnnouncement } from '@neram/database';

// PATCH /api/nata/announcements/[id] - Update a NATA announcement
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'text', 'link', 'bg_color', 'text_color', 'severity',
      'year', 'is_active', 'start_date', 'end_date', 'priority',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const data = await updateNataAnnouncement(id, updates);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating NATA announcement:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update NATA announcement';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/nata/announcements/[id] - Delete a NATA announcement
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteNataAnnouncement(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting NATA announcement:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete NATA announcement';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
