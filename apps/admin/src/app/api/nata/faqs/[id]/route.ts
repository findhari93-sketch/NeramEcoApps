// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateNataFaq, deleteNataFaq } from '@neram/database';

// PATCH /api/nata/faqs/[id] - Update a NATA FAQ
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'question', 'answer', 'category', 'page_slug',
      'year', 'display_order', 'is_active',
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

    const data = await updateNataFaq(id, updates);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating NATA FAQ:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update NATA FAQ';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/nata/faqs/[id] - Delete a NATA FAQ
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteNataFaq(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting NATA FAQ:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete NATA FAQ';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
