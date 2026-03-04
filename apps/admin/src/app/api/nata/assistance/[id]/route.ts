// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateNataAssistanceRequest } from '@neram/database';

// PATCH /api/nata/assistance/[id] - Update a NATA assistance request
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['status', 'assigned_to', 'notes'];

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

    const data = await updateNataAssistanceRequest(id, updates);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating NATA assistance request:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update NATA assistance request';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
