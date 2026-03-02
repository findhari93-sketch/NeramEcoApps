/**
 * Admin API - Question Change History
 *
 * GET /api/questions/[id]/history - Get full change history for a question
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQuestionChangeHistory } from '@neram/database';

export async function GET(
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

    const history = await getQuestionChangeHistory(id);

    return NextResponse.json({ data: history });
  } catch (error: any) {
    console.error('Error fetching question change history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch change history' },
      { status: 500 },
    );
  }
}
