export const dynamic = 'force-dynamic';

/**
 * Adopt Account API
 *
 * A student signed in with Google (or email), then verified a phone number
 * that already belongs to another Neram account, and chose "Sign in with this
 * number". The browser is now signed in to the phone account and sends both
 * ID tokens: the one it had before the switch and the current one. Holding
 * both proves the student controls both sign-ins.
 *
 * If the earlier account is a shell made moments ago by this very sign-in
 * (a lead with no application and no payment), it is merged into the phone
 * account, so the Google sign-in resolves to the right person next time.
 * Anything with real data goes to staff as a strong duplicate instead: an
 * automatic merge must never move applications or payments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getOrCreateUserFromFirebase,
  getSupabaseAdminClient,
  mergeUserRecords,
  recordDuplicateCandidate,
  updateUser,
} from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';
import { isDisposableAccount } from '@/lib/adopt-account';

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { headers: getCorsHeaders(req.headers.get('Origin')) });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const { previousIdToken, idToken } = await req.json();
    if (!previousIdToken || !idToken) {
      return NextResponse.json({ error: 'Both ID tokens are required' }, { status: 400, headers: corsHeaders });
    }

    let previousToken;
    let currentToken;
    try {
      [previousToken, currentToken] = await Promise.all([verifyIdToken(previousIdToken), verifyIdToken(idToken)]);
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401, headers: corsHeaders });
    }

    const adminClient = getSupabaseAdminClient();

    const current =
      (await getUserByFirebaseUid(currentToken.uid, adminClient)) ??
      (
        await getOrCreateUserFromFirebase(
          {
            uid: currentToken.uid,
            email: currentToken.email || null,
            emailVerified: currentToken.email_verified === true,
            phoneNumber: currentToken.phone_number || null,
            displayName: currentToken.name || null,
          },
          adminClient,
        )
      ).user;
    const previous = await getUserByFirebaseUid(previousToken.uid, adminClient);

    if (!previous || previous.id === current.id) {
      return NextResponse.json({ merged: false, userId: current.id }, { headers: corsHeaders });
    }

    if (!(await isDisposableAccount(adminClient, previous as any))) {
      await recordDuplicateCandidate(
        { userA: current.id, userB: previous.id, reason: 'phone_otp_conflict', confidence: 'strong', detectedBy: 'signin' },
        adminClient,
      );
      return NextResponse.json({ merged: false, userId: current.id }, { headers: corsHeaders });
    }

    await mergeUserRecords(current.id, previous.id, null, adminClient);

    // Keep the verified Google address on the account the student kept.
    if (!current.email && previousToken.email && previousToken.email_verified === true) {
      try {
        await updateUser(current.id, { email: previousToken.email, email_verified: true }, adminClient);
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
      }
    }

    return NextResponse.json({ merged: true, userId: current.id }, { headers: corsHeaders });
  } catch (error) {
    console.error('Adopt account error:', error);
    return NextResponse.json({ error: 'Could not join the accounts' }, { status: 500, headers: corsHeaders });
  }
}
