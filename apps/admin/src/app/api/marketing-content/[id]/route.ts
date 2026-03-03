export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { updateMarketingContent, deleteMarketingContent } from '@neram/database';

// PUT /api/marketing-content/[id] - Update marketing content
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'type', 'title', 'description', 'image_url', 'metadata',
      'status', 'is_pinned', 'display_priority',
      'starts_at', 'expires_at', 'published_at', 'created_by',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Auto-set published_at when status changes to published
    if (updates.status === 'published' && !updates.published_at) {
      updates.published_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const data = await updateMarketingContent(id, updates);
    return NextResponse.json({ data });
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown> | null;
    console.error('Error updating marketing content:', {
      message: errObj?.message,
      code: errObj?.code,
    });

    let message = 'Failed to update marketing content';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/marketing-content/[id] - Delete marketing content
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteMarketingContent(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown> | null;
    console.error('Error deleting marketing content:', {
      message: errObj?.message,
    });

    let message = 'Failed to delete marketing content';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}