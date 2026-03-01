/**
 * Admin API - Approve Improvement
 *
 * POST /api/questions/improvements/[id]/approve
 */

import { NextRequest, NextResponse } from 'next/server';
import { approveImprovement } from '@neram/database';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await approveImprovement(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error approving improvement:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve improvement' },
      { status: 500 },
    );
  }
}
