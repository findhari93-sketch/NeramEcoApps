// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { recordCallbackAttempt } from '@neram/database';

/**
 * POST /api/crm/users/[id]/callbacks/[callbackId]/attempt
 * Record a callback attempt with outcome.
 * Body: { outcome: CallbackOutcome, comments?: string, rescheduledTo?: string, adminId: string, adminName: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; callbackId: string } }
) {
  try {
    const body = await request.json();
    const { outcome, comments, rescheduledTo, adminId, adminName } = body;

    if (!outcome || !adminId) {
      return NextResponse.json(
        { error: 'outcome and adminId are required' },
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

    const validOutcomes = ['talked', 'not_picked_up', 'not_reachable', 'rescheduled', 'dead_lead'];
    if (!validOutcomes.includes(outcome)) {
      return NextResponse.json(
        { error: `outcome must be one of: ${validOutcomes.join(', ')}` },
        { status: 400 }
      );
    }

    if (outcome === 'rescheduled' && !rescheduledTo) {
      return NextResponse.json(
        { error: 'rescheduledTo is required when outcome is "rescheduled"' },
        { status: 400 }
      );
    }

    const attempt = await recordCallbackAttempt(
      params.callbackId,
      adminId,
      adminName || 'Admin',
      outcome,
      comments,
      rescheduledTo
    );

    return NextResponse.json({ success: true, attempt });
  } catch (error: any) {
    console.error('CRM callback attempt error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to record callback attempt' },
      { status: 500 }
    );
  }
}