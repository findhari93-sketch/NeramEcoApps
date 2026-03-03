export const dynamic = 'force-dynamic';

/**
 * Score Calculation [id] API
 *
 * PATCH /api/score-calculations/[id]  — Update purpose/label on an existing calculation
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  updateCalculationPurpose,
  getSupabaseAdminClient,
} from '@neram/database';
import type { CalculationPurpose } from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

const VALID_PURPOSES: CalculationPurpose[] = [
  'actual_score',
  'prediction',
  'target',
  'exploring',
];

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: corsHeaders }
      );
    }

    const decoded = await verifyIdToken(idToken);
    const user = await getUserByFirebaseUid(decoded.uid, getSupabaseAdminClient());
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { purpose, label } = body;

    if (!purpose || !VALID_PURPOSES.includes(purpose as CalculationPurpose)) {
      return NextResponse.json(
        { error: `purpose must be one of: ${VALID_PURPOSES.join(', ')}` },
        { status: 400, headers: corsHeaders }
      );
    }

    const updated = await updateCalculationPurpose({
      id: params.id,
      userId: user.id,
      purpose: purpose as CalculationPurpose,
      label: label ?? undefined,
    });

    return NextResponse.json(
      { success: true, calculation: updated },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    console.error('Score calculation PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update calculation' },
      { status: 500, headers: corsHeaders }
    );
  }
}