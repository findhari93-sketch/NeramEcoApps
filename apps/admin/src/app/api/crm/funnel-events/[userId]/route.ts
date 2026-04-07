export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getFunnelEventsForUser, getUserAuthDiagnostics, getErrorLogsForUser } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    const [events, diagnostics, errorLogs] = await Promise.all([
      getFunnelEventsForUser(userId),
      getUserAuthDiagnostics(userId),
      getErrorLogsForUser(userId, 20),
    ]);

    return NextResponse.json({
      events,
      diagnostics,
      errorLogs,
    });
  } catch (error: any) {
    console.error('Funnel events fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch funnel events' },
      { status: 500 }
    );
  }
}
