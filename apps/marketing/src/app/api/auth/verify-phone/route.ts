export const dynamic = 'force-dynamic';

/**
 * Verify Phone API (Marketing)
 *
 * Updates user's phone number and phone_verified status in Supabase
 * after successful Firebase phone verification on the enrollment page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import {
  getUserByFirebaseUid,
  updateUser,
  getOrCreateUserFromFirebase,
  checkPhoneExists,
  getSupabaseAdminClient,
} from '@neram/database';

// Firebase Admin is initialized in _lib/auth.ts — ensure it's imported
import '@/app/api/_lib/auth';

function verifyIdToken(idToken: string) {
  if (!getApps().length) {
    throw new Error('Firebase Admin not initialized');
  }
  return getAuth().verifyIdToken(idToken);
}

export async function POST(req: NextRequest) {
  try {
    const { idToken, phoneNumber } = await req.json();

    if (!idToken || !phoneNumber) {
      return NextResponse.json(
        { error: 'ID token and phone number are required' },
        { status: 400 }
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
        { status: 401 }
      );
    }

    const adminClient = getSupabaseAdminClient();

    // Get user from Supabase
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
          { status: 404 }
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
        { status: 409 }
      );
    }

    // Update user with verified phone
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
    });
  } catch (error) {
    console.error('Error verifying phone:', error);
    return NextResponse.json(
      { error: 'Failed to verify phone' },
      { status: 500 }
    );
  }
}
