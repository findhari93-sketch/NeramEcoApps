// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingAnalytics } from '@neram/database';

// GET /api/onboarding/analytics - Get onboarding analytics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const data = await getOnboardingAnalytics({ startDate, endDate });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching onboarding analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding analytics' },
      { status: 500 }
    );
  }
}
