export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthFunnelSummary } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const sourceApp = searchParams.get('source_app') || undefined;

    const summary = await getAuthFunnelSummary(days, sourceApp);

    // Aggregate across weeks for a total summary
    const totals = summary.reduce(
      (acc, row) => ({
        auth_started: acc.auth_started + Number(row.auth_started || 0),
        auth_completed: acc.auth_completed + Number(row.auth_completed || 0),
        user_registered: acc.user_registered + Number(row.user_registered || 0),
        phone_shown: acc.phone_shown + Number(row.phone_shown || 0),
        phone_entered: acc.phone_entered + Number(row.phone_entered || 0),
        otp_requested: acc.otp_requested + Number(row.otp_requested || 0),
        otp_verified: acc.otp_verified + Number(row.otp_verified || 0),
      }),
      {
        auth_started: 0,
        auth_completed: 0,
        user_registered: 0,
        phone_shown: 0,
        phone_entered: 0,
        otp_requested: 0,
        otp_verified: 0,
      }
    );

    return NextResponse.json({
      weekly: summary,
      totals,
    });
  } catch (error: any) {
    console.error('Funnel summary error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch funnel summary' },
      { status: 500 }
    );
  }
}
