// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { markUserAsIrrelevant } from '@neram/database';

/**
 * POST /api/crm/users/[id]/irrelevant
 * Mark a user as irrelevant (casual browser, not in pipeline).
 * Body: { reason: string, adminId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { reason, adminId } = body;

    if (!reason || !adminId) {
      return NextResponse.json(
        { error: 'reason and adminId are required' },
        { status: 400 }
      );
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID' },
        { status: 400 }
      );
    }

    await markUserAsIrrelevant(params.id, adminId, reason);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRM mark irrelevant error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to mark as irrelevant' },
      { status: 500 }
    );
  }
}
