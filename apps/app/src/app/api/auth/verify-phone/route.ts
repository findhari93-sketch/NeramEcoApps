/**
 * Verify Phone API
 *
 * Updates user's phone number and phone_verified status in Supabase
 * after successful Firebase phone verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, updateUser, getOrCreateUserFromFirebase, checkPhoneExists, getSupabaseAdminClient } from '@neram/database';

import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
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

    // Check if this phone number is already used by a DIFFERENT user
    const existingPhoneUser = await checkPhoneExists(phoneNumber, user.id, adminClient);
    if (existingPhoneUser) {
      return NextResponse.json(
        {
          error: 'PHONE_ALREADY_EXISTS',
          message: 'This phone number is already registered with another account. Please use a different phone number or sign in with the existing account.',
        },
        { status: 409, headers: corsHeaders }
      );
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
