export const dynamic = 'force-dynamic';

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { markUserAsDeadLead } from '@neram/database';

/**
 * POST /api/crm/users/[id]/dead-lead
 * Mark a user as a dead lead.
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

    // Validate adminId is a valid UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID). Admin profile may not be resolved yet.' },
        { status: 400 }
      );
    }

    await markUserAsDeadLead(params.id, adminId, reason);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRM dead lead error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to mark as dead lead' },
      { status: 500 }
    );
  }
}