export const dynamic = 'force-dynamic';

/**
 * Admin API - Approve Question
 *
 * POST /api/questions/[id]/approve
 */

import { NextRequest, NextResponse } from 'next/server';
import { approveQuestion } from '@neram/database';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 },
      );
    }

    const question = await approveQuestion(id);

    return NextResponse.json({ data: question });
  } catch (error: any) {
    console.error('Error approving question:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve question' },
      { status: 500 },
    );
  }
}