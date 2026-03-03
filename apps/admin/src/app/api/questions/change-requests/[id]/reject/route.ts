export const dynamic = 'force-dynamic';

/**
 * Admin API - Reject Change Request
 *
 * POST /api/questions/change-requests/[id]/reject
 * Body: { reason: string, adminId?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { rejectChangeRequest } from '@neram/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Change request ID is required' },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { reason, adminId } = body;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 },
      );
    }

    await rejectChangeRequest(id, reason.trim(), adminId || 'admin');

    return NextResponse.json({ data: { id, status: 'rejected' } });
  } catch (error: any) {
    console.error('Error rejecting change request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject change request' },
      { status: 500 },
    );
  }
}