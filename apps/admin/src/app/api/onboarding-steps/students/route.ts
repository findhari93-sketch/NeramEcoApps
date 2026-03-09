// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getOnboardingOverview } from '@neram/database';

// GET /api/onboarding-steps/students - List all students with onboarding progress
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const batchId = searchParams.get('batchId') || undefined;
    const courseId = searchParams.get('courseId') || undefined;
    const completionFilter = (searchParams.get('completionFilter') || 'all') as 'all' | 'complete' | 'incomplete';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const supabase = getSupabaseAdminClient();
    const result = await getOnboardingOverview(supabase, {
      search,
      batchId,
      courseId,
      completionFilter,
      page,
      limit,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching student onboarding overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch student onboarding data' },
      { status: 500 }
    );
  }
}
