// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listAppFeedback,
  updateAppFeedback,
  getAppFeedbackStats,
} from '@neram/database';
import type { AppFeedbackStatus, AppFeedbackCategory } from '@neram/database';

// GET /api/feedback - List all feedback with filters (admin view)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as AppFeedbackStatus | null;
    const category = searchParams.get('category') as AppFeedbackCategory | null;
    const rating = searchParams.get('rating');
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const includeStats = searchParams.get('stats') === 'true';

    const supabase = getSupabaseAdminClient();

    const { data: feedback, total } = await listAppFeedback(
      {
        status: status || undefined,
        category: category || undefined,
        rating: rating ? parseInt(rating) : undefined,
        search,
        page,
        limit,
      },
      supabase
    );

    const response: Record<string, unknown> = {
      success: true,
      data: feedback,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    if (includeStats) {
      const stats = await getAppFeedbackStats(supabase);
      response.stats = stats;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error listing feedback:', error);
    return NextResponse.json(
      { error: 'Failed to list feedback' },
      { status: 500 }
    );
  }
}

// PATCH /api/feedback - Update feedback status/notes
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, admin_notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No update fields provided' },
        { status: 400 }
      );
    }

    const feedback = await updateAppFeedback(id, updates, supabase);

    return NextResponse.json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    return NextResponse.json(
      { error: 'Failed to update feedback' },
      { status: 500 }
    );
  }
}
