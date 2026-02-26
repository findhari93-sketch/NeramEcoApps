/**
 * Username Login API
 *
 * POST - Login with username and password
 *
 * This creates a Firebase custom token for users who want to
 * login with their username instead of email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCustomToken } from '@/lib/firebase-admin';
import { getUserByUsername } from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/auth/username-login
 * Lookup user by username and return custom token for Firebase auth
 *
 * Note: Password verification happens on the client with Firebase
 * This endpoint just resolves username -> firebase_uid
 */
export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const { username } = await req.json();

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Look up user by username
    const user = await getUserByUsername(username);

    if (!user) {
      // Don't reveal whether username exists
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if user has password auth enabled
    if (!user.has_password) {
      return NextResponse.json(
        { error: 'This account does not have password authentication enabled' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if user has Firebase UID
    if (!user.firebase_uid) {
      return NextResponse.json(
        { error: 'Account not linked to authentication provider' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Return email for Firebase email/password auth
    // The client will use signInWithEmail with this email
    return NextResponse.json(
      {
        email: user.email,
        userId: user.id,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error in username login:', error);
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
