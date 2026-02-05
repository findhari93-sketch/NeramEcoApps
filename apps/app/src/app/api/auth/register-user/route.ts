/**
 * Register/Check User API
 *
 * This API registers a Firebase user in Supabase or returns existing user data.
 * Called after successful Firebase authentication to sync user with database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getOrCreateUserFromFirebase, updateUser, getUserByFirebaseUid } from '@neram/database';

// CORS headers for cross-domain requests
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json(
        { error: 'ID token is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyIdToken(idToken);

    // Get or create user in Supabase
    const user = await getOrCreateUserFromFirebase({
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      phoneNumber: decodedToken.phone_number || null,
      displayName: decodedToken.name || null,
    });

    // Update last login time
    await updateUser(user.id, {
      last_login_at: new Date().toISOString(),
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        phone_verified: user.phone_verified,
        email_verified: user.email_verified,
        user_type: user.user_type,
        status: user.status,
      },
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error registering user:', error);
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500, headers: corsHeaders }
    );
  }
}
