// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateNataBrochure, deleteNataBrochure } from '@neram/database';

// PATCH /api/nata/brochures/[id] - Update a NATA brochure
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'version', 'release_date', 'year', 'file_url', 'file_size_bytes',
      'changelog', 'is_current', 'is_active', 'display_order', 'uploaded_by',
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

    const data = await updateNataBrochure(id, updates);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating NATA brochure:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update NATA brochure';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/nata/brochures/[id] - Delete a NATA brochure
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteNataBrochure(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting NATA brochure:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete NATA brochure';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
