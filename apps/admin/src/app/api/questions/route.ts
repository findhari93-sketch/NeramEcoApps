export const dynamic = 'force-dynamic';

/**
 * Admin API - Question & Improvement Moderation List
 *
 * GET /api/questions - Get questions or improvements filtered by status
 *   Query params: status, page, limit, type ('questions' | 'improvements')
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getQuestionsByStatus,
  getQuestionModerationStats,
  getImprovementsByStatus,
} from '@neram/database';
import type { QuestionPostStatus } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') as QuestionPostStatus) || 'pending';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const type = searchParams.get('type') || 'questions';

    if (type === 'improvements') {
      const improvements = await getImprovementsByStatus(status, page, limit);
      return NextResponse.json({
        data: improvements.data,
        pagination: improvements.pagination,
      });
    }

    const [questions, stats] = await Promise.all([
      getQuestionsByStatus(status, page, limit),
      getQuestionModerationStats(),
    ]);

    return NextResponse.json({
      data: questions.data,
      pagination: questions.pagination,
      stats,
    });
  } catch (error: any) {
    console.error('Error fetching moderation data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch data' },
      { status: 500 },
    );
  }
}