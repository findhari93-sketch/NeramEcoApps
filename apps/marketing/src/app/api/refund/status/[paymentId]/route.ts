// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyFirebaseToken } from '../../../_lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    const { paymentId } = await params;

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'paymentId is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    // Scoped to the signed-in student, and without staff-only columns
    // (admin_notes, reviewed_by).
    const { data: refundRequest, error } = await supabase
      .from('refund_requests')
      .select('id, payment_id, lead_profile_id, status, payment_amount, processing_fee, refund_amount, reason_for_joining, reason_for_discontinuing, additional_notes, created_at, updated_at, reviewed_at')
      .eq('payment_id', paymentId)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json(
      { refundRequest: refundRequest || null },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Refund status error:', error);
    return NextResponse.json(
      { error: 'Failed to check refund status' },
      { status: 500 }
    );
  }
}