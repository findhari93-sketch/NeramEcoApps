// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateNataBanner, deleteNataBanner } from '@neram/database';

// PATCH /api/nata/banners/[id] - Update a NATA banner
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'spot', 'heading', 'subtext', 'image_url', 'mobile_image_url',
      'cta_text', 'cta_link', 'is_active', 'start_date', 'end_date', 'display_order',
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

    const data = await updateNataBanner(id, updates);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating NATA banner:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update NATA banner';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/nata/banners/[id] - Delete a NATA banner
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteNataBanner(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting NATA banner:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete NATA banner';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
