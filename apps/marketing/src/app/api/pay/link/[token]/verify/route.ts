// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getLeadProfileByPaymentToken } from '@neram/database';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (err) {
    console.warn('Firebase Admin initialization warning:', err instanceof Error ? err.message : err);
  }
}

/**
 * POST /api/pay/link/[token]/verify
 * After Firebase phone OTP succeeds on the client, call this to:
 * 1. Verify the Firebase phone ID token
 * 2. Check the phone number matches the application
 * 3. Determine the correct firebase_uid to use:
 *    - If the user already has a firebase_uid (Google OAuth or prior phone auth) → use that
 *    - If not → store the phone auth UID
 * 4. Generate and return a Firebase custom token for the correct firebase_uid
 *    so the client can sign in with the right UID regardless of which auth
 *    method was used previously (phone auth UID vs Google OAuth UID conflict)
 *
 * Body: { firebaseToken: string }
 * Returns: { customToken: string, applicationNumber: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { firebaseToken } = await request.json();

    if (!firebaseToken) {
      return NextResponse.json({ error: 'firebaseToken is required' }, { status: 400 });
    }

    // Verify the Firebase phone auth ID token
    let decoded: any;
    try {
      decoded = await getAuth().verifyIdToken(firebaseToken);
    } catch {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }

    const phoneAuthUid = decoded.uid;
    const firebasePhone: string | undefined = decoded.phone_number;

    const client = createAdminClient();
    const lead = await getLeadProfileByPaymentToken(params.token, client);

    if (!lead) {
      return NextResponse.json({ error: 'invalid_or_expired' }, { status: 400 });
    }

    if (lead.payment_link_expires_at && new Date(lead.payment_link_expires_at) < new Date()) {
      return NextResponse.json({ error: 'invalid_or_expired' }, { status: 400 });
    }

    if (lead.status !== 'approved') {
      return NextResponse.json({ error: 'not_approved' }, { status: 403 });
    }

    // Security: verify the phone that completed OTP matches the application phone
    const storedPhone = lead.users?.phone?.replace(/\D/g, '') ?? '';
    const authedPhone = firebasePhone?.replace(/\D/g, '') ?? '';

    if (!storedPhone || !authedPhone || !authedPhone.endsWith(storedPhone.slice(-10))) {
      return NextResponse.json({ error: 'phone_mismatch' }, { status: 403 });
    }

    // Determine the correct firebase_uid for this user:
    // - Use existing firebase_uid if set (could be Google OAuth UID or prior phone auth UID)
    // - Otherwise use the phone auth UID from this OTP and store it
    let canonicalUid = lead.users?.firebase_uid;

    if (!canonicalUid) {
      // First time auth - store the phone auth UID
      const { error: updateError } = await client
        .from('users')
        .update({ firebase_uid: phoneAuthUid })
        .eq('id', lead.user_id);

      if (updateError) {
        console.error('Failed to link firebase_uid:', updateError);
        return NextResponse.json({ error: 'link_failed' }, { status: 500 });
      }

      canonicalUid = phoneAuthUid;
    }

    // Generate a Firebase custom token for the canonical UID.
    // This gives the student a valid Firebase session that matches users.firebase_uid,
    // regardless of whether they previously authenticated via Google or phone OTP.
    const customToken = await getAuth().createCustomToken(canonicalUid);

    return NextResponse.json({
      customToken,
      applicationNumber: lead.application_number,
    });
  } catch (error: any) {
    console.error('Payment link verify error:', error);
    return NextResponse.json(
      { error: error.message || 'Verification failed' },
      { status: 500 }
    );
  }
}
