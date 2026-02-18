/**
 * Set Username API
 *
 * POST - Set username for a user
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, setUsername } from '@neram/database';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_MARKETING_URL || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/auth/set-username
 * Set username for authenticated user
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyIdToken(idToken);

    // Get user from database
    const user = await getUserByFirebaseUid(decodedToken.uid);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const { username } = await req.json();

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_.]{3,30}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3-30 characters, alphanumeric with underscores or dots only' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Set username (this will check availability and record history)
    const updatedUser = await setUsername(user.id, username, {
      changeSource: 'user',
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: updatedUser?.id,
          username: updatedUser?.username,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('Error setting username:', error);

    // Handle specific errors
    if (error?.message === 'Username is already taken') {
      return NextResponse.json(
        { error: 'Username is already taken' },
        { status: 409, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: 'Failed to set username' },
      { status: 500, headers: corsHeaders }
    );
  }
}
