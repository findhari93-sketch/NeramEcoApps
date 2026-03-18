// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateAintraKnowledgeBaseItem, deleteAintraKnowledgeBaseItem } from '@neram/database';

// PATCH /api/aintra/kb/[id] - Update a KB item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['question', 'answer', 'category', 'display_order', 'is_active'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const data = await updateAintraKnowledgeBaseItem(id, updates);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating Aintra KB item:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update KB item';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/aintra/kb/[id] - Delete a KB item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteAintraKnowledgeBaseItem(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting Aintra KB item:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete KB item';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
