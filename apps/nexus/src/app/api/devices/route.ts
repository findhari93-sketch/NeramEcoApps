export const dynamic = 'force-dynamic';

/**
 * GET /api/devices - Device analytics for staff
 *
 * Query params:
 *   ?type=stats       → Device distribution stats
 *   ?type=students    → Paginated student device list
 *   ?type=student-detail&userId=  → Single student detail
 *
 * This route was previously UNAUTHENTICATED: no token check and no role check,
 * serving the whole searchable student device dataset (names, emails, devices) to
 * anyone who knew the URL. It now requires a staff session.
 *
 * The `// @ts-nocheck` that used to sit on line 1 is also gone. It was hiding the
 * missing auth from review as much as from the compiler.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getDeviceDistributionStats,
  getStudentDeviceSummaries,
  getStudentDeviceDetail,
} from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req.headers.get('Authorization'));
    assertCapability(user, 'coord.student.view');

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'stats';

    if (type === 'stats') {
      const stats = await getDeviceDistributionStats();
      return NextResponse.json(stats);
    }

    if (type === 'students') {
      // Clamp the page size: an unbounded limit turns a paginated list into a
      // full export of every student's device history in one request.
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
      const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
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
    return errorResponse(error, 'Failed to load device analytics');
  }
}
