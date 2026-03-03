export const dynamic = 'force-dynamic';

/**
 * Admin API - Reject Improvement
 *
 * POST /api/questions/improvements/[id]/reject
 * Body: { reason: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { rejectImprovement } from '@neram/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 },
      );
    }

    await rejectImprovement(id, reason);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error rejecting improvement:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject improvement' },
      { status: 500 },
    );
  }
}