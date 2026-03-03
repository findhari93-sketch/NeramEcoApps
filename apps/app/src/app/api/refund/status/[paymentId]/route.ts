// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getRefundRequestByPaymentId } from '@neram/database';
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

async function verifyToken(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.substring(7));
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users' as any)
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    if (!user) return null;
    return { userId: user.id };
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const auth = await verifyToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paymentId } = await params;
    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const refundRequest = await getRefundRequestByPaymentId(paymentId, supabase);

    return NextResponse.json({ refundRequest: refundRequest || null });
  } catch (error) {
    console.error('Refund status error:', error);
    return NextResponse.json({ error: 'Failed to check refund status' }, { status: 500 });
  }
}