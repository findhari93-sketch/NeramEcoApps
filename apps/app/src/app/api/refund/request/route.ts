// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createRefundRequest, notifyRefundRequested } from '@neram/database';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {
    // Already initialized
  }
}

async function verifyToken(request: NextRequest): Promise<{ userId: string; email: string | null; name: string | null; phone: string | null } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.substring(7));
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users' as any)
      .select('id, email, first_name, last_name, phone')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    if (!user) return null;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
    return { userId: user.id, email: user.email, name, phone: user.phone };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { payment_id, reason_for_joining, reason_for_discontinuing, additional_notes } = body;

    if (!payment_id) {
      return NextResponse.json({ error: 'payment_id is required' }, { status: 400 });
    }

    if (!reason_for_joining || reason_for_joining.trim().length < 10) {
      return NextResponse.json({ error: 'Please provide a reason for joining (at least 10 characters)' }, { status: 400 });
    }

    if (!reason_for_discontinuing || reason_for_discontinuing.trim().length < 10) {
      return NextResponse.json({ error: 'Please provide a reason for discontinuing (at least 10 characters)' }, { status: 400 });
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

    return NextResponse.json({ success: true, refundRequest });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit refund request';
    console.error('Refund request error:', message);

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