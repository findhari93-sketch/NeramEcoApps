// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * GET /api/devices - Device analytics for teachers
 *
 * Query params:
 *   ?type=stats       → Device distribution stats
 *   ?type=students    → Paginated student device list
 *   ?type=student-detail&userId=  → Single student detail
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getDeviceDistributionStats,
  getStudentDeviceSummaries,
  getStudentDeviceDetail,
} from '@neram/database';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'stats';

    if (type === 'stats') {
      const stats = await getDeviceDistributionStats();
      return NextResponse.json(stats);
    }

    if (type === 'students') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');
      const search = searchParams.get('search') || undefined;
      const result = await getStudentDeviceSummaries({ limit, offset, search });
      return NextResponse.json(result);
    }

    if (type === 'student-detail') {
      const userId = searchParams.get('userId');
      if (!userId) {
        return NextResponse.json({ error: 'userId required' }, { status: 400 });
      }
      const detail = await getStudentDeviceDetail(userId);
      return NextResponse.json(detail);
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Device analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
