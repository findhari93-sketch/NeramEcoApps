// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createRefundRequest, notifyRefundRequested } from '@neram/database';
import { verifyFirebaseToken } from '../../_lib/auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { payment_id, reason_for_joining, reason_for_discontinuing, additional_notes } = body;

    if (!payment_id) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'payment_id is required' },
        { status: 400 }
      );
    }

    if (!reason_for_joining || reason_for_joining.trim().length < 10) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Please provide a reason for joining (at least 10 characters)' },
        { status: 400 }
      );
    }

    if (!reason_for_discontinuing || reason_for_discontinuing.trim().length < 10) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Please provide a reason for discontinuing (at least 10 characters)' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const refundRequest = await createRefundRequest(
      auth.userId,
      {
        payment_id,
        reason_for_joining: reason_for_joining.trim(),
        reason_for_discontinuing: reason_for_discontinuing.trim(),
        additional_notes: additional_notes?.trim() || undefined,
      },
      supabase
    );

    // Dispatch notifications
    try {
      await notifyRefundRequested({
        userId: auth.userId,
        userName: auth.name || auth.email || 'Unknown',
        phone: auth.phone || '',
        email: auth.email || '',
        paymentAmount: Number(refundRequest.payment_amount),
        refundAmount: Number(refundRequest.refund_amount),
        processingFee: Number(refundRequest.processing_fee),
        reasonForDiscontinuing: reason_for_discontinuing.trim(),
        paymentId: payment_id,
        leadProfileId: refundRequest.lead_profile_id || undefined,
      }, supabase);
    } catch (err) {
      console.error('Failed to send refund request notifications:', err);
    }

    return NextResponse.json({
      success: true,
      refundRequest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit refund request';
    console.error('Refund request error:', message);

    // Return user-friendly error for known validation errors
    const knownErrors = [
      'Payment not found',
      'Refund can only be requested',
      'Refund window has expired',
      'refund request already exists',
      'Payment completion time',
    ];

    const isKnownError = knownErrors.some((e) => message.includes(e));

    return NextResponse.json(
      { error: isKnownError ? message : 'Failed to submit refund request' },
      { status: isKnownError ? 400 : 500 }
    );
  }
}