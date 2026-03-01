/**
 * Admin API - Reject Question
 *
 * POST /api/questions/[id]/reject
 */

import { NextRequest, NextResponse } from 'next/server';
import { rejectQuestion } from '@neram/database';

export async function POST(
  req: NextRequest,
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

    const body = await req.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 },
      );
    }

    const question = await rejectQuestion(id, reason.trim());

    return NextResponse.json({ data: question });
  } catch (error: any) {
    console.error('Error rejecting question:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject question' },
      { status: 500 },
    );
  }
}
