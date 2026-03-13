// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
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

// POST /api/auth/exchange-token - Exchange Firebase ID token for a custom token
export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'ID token is required' }, { status: 400 });
    }

    const auth = getAuth();

    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);

    // Create a custom token for cross-domain sign-in
    const customToken = await auth.createCustomToken(decodedToken.uid);

    return NextResponse.json({ customToken });
  } catch (error: any) {
    console.error('[exchange-token] Error:', error.code, error.message);
    return NextResponse.json(
      { error: 'Token exchange failed' },
      { status: 500 }
    );
  }
}
