export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getCounselingSystems,
  getCounselingStats,
  getAuditLog,
} from '@neram/database';

/**
 * GET /api/counseling
 * Returns counseling systems list + optional stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'systems';

    if (action === 'systems') {
      const systems = await getCounselingSystems();
      return NextResponse.json({ systems });
    }

    if (action === 'stats') {
      const systemId = searchParams.get('systemId') || undefined;
      const stats = await getCounselingStats(systemId);
      return NextResponse.json({ stats });
    }

    if (action === 'audit-log') {
      const result = await getAuditLog({
        tableName: searchParams.get('tableName') || undefined,
        recordId: searchParams.get('recordId') || undefined,
        changedBy: searchParams.get('changedBy') || undefined,
        startDate: searchParams.get('startDate') || undefined,
        endDate: searchParams.get('endDate') || undefined,
        limit: parseInt(searchParams.get('limit') || '50', 10),
        offset: parseInt(searchParams.get('offset') || '0', 10),
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('Counseling API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch counseling data' },
      { status: 500 }
    );
  }
}
