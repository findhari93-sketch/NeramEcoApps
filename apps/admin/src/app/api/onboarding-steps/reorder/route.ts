// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, reorderOnboardingSteps } from '@neram/database';

// POST /api/onboarding-steps/reorder - Reorder step definitions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderedIds } = body;

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: 'orderedIds array is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    await reorderOnboardingSteps(orderedIds, supabase);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering onboarding steps:', error);
    return NextResponse.json(
      { error: 'Failed to reorder onboarding steps' },
      { status: 500 }
    );
  }
}
