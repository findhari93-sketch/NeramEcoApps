// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * GET /api/devices/swap-requests - List swap requests (with optional status filter)
 * POST /api/devices/swap-requests - Approve or reject a swap request
 *
 * POST body: { requestId, action: 'approve'|'reject', adminNotes?, adminId }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getDeviceSwapRequests,
  approveDeviceSwapRequest,
  rejectDeviceSwapRequest,
  getPendingSwapRequestCount,
} from '@neram/database';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (searchParams.get('type') === 'count') {
      const count = await getPendingSwapRequestCount();
      return NextResponse.json({ count });
    }

    const result = await getDeviceSwapRequests({ status, limit, offset });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Get swap requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, action, adminNotes, adminId } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Missing requestId or action' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Use a placeholder admin ID if not provided (admin app doesn't always track this)
    const effectiveAdminId = adminId || '00000000-0000-0000-0000-000000000000';

    let result;
    if (action === 'approve') {
      result = await approveDeviceSwapRequest(requestId, effectiveAdminId, adminNotes);
    } else {
      result = await rejectDeviceSwapRequest(requestId, effectiveAdminId, adminNotes);
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Swap request action error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
