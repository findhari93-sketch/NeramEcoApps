/**
 * Verify Phone API
 *
 * Updates user's phone number and phone_verified status in Supabase
 * after successful Firebase phone verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, updateUser, getOrCreateUserFromFirebase, getSupabaseAdminClient } from '@neram/database';

// CORS headers for cross-domain requests
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { idToken, phoneNumber } = await req.json();

    if (!idToken || !phoneNumber) {
      return NextResponse.json(
        { error: 'ID token and phone number are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch (tokenError) {
      console.error('Firebase token verification failed:', tokenError);
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401, headers: corsHeaders }
      );
    }

    const adminClient = getSupabaseAdminClient();

    // Get user from Supabase (use admin client to bypass RLS)
    let user = await getUserByFirebaseUid(decodedToken.uid, adminClient);

    if (!user) {
      // Fallback: create user if register-user hadn't completed
      try {
        user = await getOrCreateUserFromFirebase({
          uid: decodedToken.uid,
          email: decodedToken.email || null,
          phoneNumber: phoneNumber,
          displayName: decodedToken.name || null,
        });
      } catch (createError) {
        console.error('Failed to create fallback user:', createError);
        return NextResponse.json(
          { error: 'User not found and could not be created' },
          { status: 404, headers: corsHeaders }
        );
      }
    }

    // Update user with verified phone (use admin client to bypass RLS)
    const updatedUser = await updateUser(user.id, {
      phone: phoneNumber,
      phone_verified: true,
    }, adminClient);

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        phone_verified: updatedUser.phone_verified,
      },
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error verifying phone:', error);
    return NextResponse.json(
      { error: 'Failed to verify phone' },
      { status: 500, headers: corsHeaders }
    );
  }
}
