/**
 * Verify Phone API
 *
 * Updates user's phone number and phone_verified status in Supabase
 * after successful Firebase phone verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, updateUser } from '@neram/database';

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
    const { idToken, phoneNumber } = await req.json();

    if (!idToken || !phoneNumber) {
      return NextResponse.json(
        { error: 'ID token and phone number are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyIdToken(idToken);

    // Get user from Supabase
    const user = await getUserByFirebaseUid(decodedToken.uid);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Update user with verified phone
    const updatedUser = await updateUser(user.id, {
      phone: phoneNumber,
      phone_verified: true,
    });

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
