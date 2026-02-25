// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getRefundRequestByPaymentId } from '@neram/database';
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
    const refundRequest = await getRefundRequestByPaymentId(paymentId, supabase);

    return NextResponse.json({
      refundRequest: refundRequest || null,
    });
  } catch (error) {
    console.error('Refund status error:', error);
    return NextResponse.json(
      { error: 'Failed to check refund status' },
      { status: 500 }
    );
  }
}
