/**
 * Admin API - Approve Change Request
 *
 * POST /api/questions/change-requests/[id]/approve
 * Body: { adminId?: string }
 *
 * Determines if request is edit or delete, and calls the appropriate handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  approveEditRequest,
  approveDeleteRequest,
} from '@neram/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Change request ID is required' },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const adminId = body.adminId || 'admin';

    // Fetch the change request to determine its type
    const adminClient = getSupabaseAdminClient();
    const { data: cr, error: fetchErr } = await (adminClient as any)
      .from('question_change_requests')
      .select('request_type')
      .eq('id', id)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !cr) {
      return NextResponse.json(
        { error: 'Change request not found or already processed' },
        { status: 404 },
      );
    }

    if ((cr as any).request_type === 'edit') {
      await approveEditRequest(id, adminId, adminClient);
    } else {
      await approveDeleteRequest(id, adminId, adminClient);
    }

    return NextResponse.json({ data: { id, status: 'approved' } });
  } catch (error: any) {
    console.error('Error approving change request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve change request' },
      { status: 500 },
    );
  }
}
