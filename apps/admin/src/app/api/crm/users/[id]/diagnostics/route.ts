export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDeviceSessionsForUser, getErrorLogsForUser } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [sessions, errors] = await Promise.all([
      getDeviceSessionsForUser(params.id),
      getErrorLogsForUser(params.id),
    ]);

    return NextResponse.json({ sessions, errors });
  } catch (error: any) {
    console.error('Diagnostics fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch diagnostics' },
      { status: 500 }
    );
  }
}
