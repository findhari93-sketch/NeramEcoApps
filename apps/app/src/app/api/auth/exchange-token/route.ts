export const dynamic = 'force-dynamic';

/**
 * Token Exchange API
 *
 * Verifies a Firebase ID token and creates a custom token for cross-domain authentication.
 * This enables the marketing site to authenticate users who logged in on the tools app.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, createCustomToken } from '@/lib/firebase-admin';
import { getOrCreateUserFromFirebase, createLogger } from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

const log = createLogger('[exchange-token]');

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json(
        { error: 'ID token is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify the ID token
    const decodedToken = await verifyIdToken(idToken);
    log.debug('Verified ID token for UID:', decodedToken.uid);
    log.debug('Token issuer:', decodedToken.iss);

    // Sync Google profile data to Supabase while we have the full token data
    // (custom tokens only carry UID, so register-user won't have this data)
    await getOrCreateUserFromFirebase({
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      phoneNumber: decodedToken.phone_number || null,
      displayName: decodedToken.name || null,
      photoURL: decodedToken.picture || null,
    });

    // Create a custom token for the user
    const customToken = await createCustomToken(decodedToken.uid);
    // The service-account email used to be logged here on every auth. It is a
    // credential identifier and does not belong in a log line.
    log.debug('Custom token created for UID:', decodedToken.uid);

    return NextResponse.json(
      {
        customToken,
        user: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name,
          picture: decodedToken.picture,
        }
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[exchange-token] Error:', error.code, error.message);

    // Handle specific Firebase errors
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json(
        { error: 'Token expired. Please log in again.' },
        { status: 401, headers: corsHeaders }
      );
    }

    if (error.code === 'auth/invalid-id-token') {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: 'Token exchange failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}