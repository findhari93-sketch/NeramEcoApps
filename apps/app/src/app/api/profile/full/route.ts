/**
 * Full Profile API
 *
 * GET - Get comprehensive user profile including application,
 *       enrollment, payment, and scholarship data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getFullUserProfile,
  getSupabaseAdminClient,
} from '@neram/database';

/**
 * GET /api/profile/full
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const decodedToken = await verifyIdToken(idToken);
    const adminClient = getSupabaseAdminClient();

    const user = await getUserByFirebaseUid(decodedToken.uid, adminClient);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const fullProfile = await getFullUserProfile(user.id, adminClient);
    if (!fullProfile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(fullProfile);
  } catch (error) {
    console.error('Error getting full profile:', error);
    return NextResponse.json(
      { error: 'Failed to get profile' },
      { status: 500 }
    );
  }
}
