/**
 * Admin API - Change Requests List
 *
 * GET /api/questions/change-requests - List change requests by status
 *   Query params: status (pending/approved/rejected), type (edit/delete), page, limit
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getChangeRequestsByStatus,
  getChangeRequestStats,
} from '@neram/database';
import type { QuestionChangeRequestStatus, QuestionChangeRequestType } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') as QuestionChangeRequestStatus) || 'pending';
    const requestType = searchParams.get('type') as QuestionChangeRequestType | null;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const [changeRequests, stats] = await Promise.all([
      getChangeRequestsByStatus(status, requestType || undefined, page, limit),
      getChangeRequestStats(),
    ]);

    return NextResponse.json({
      data: changeRequests.data,
      pagination: changeRequests.pagination,
      stats,
    });
  } catch (error: any) {
    console.error('Error fetching change requests:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch change requests' },
      { status: 500 },
    );
  }
}
