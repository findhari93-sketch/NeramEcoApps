/**
 * Question Bank API - User Stats & Access Level
 *
 * GET /api/questions/qb-stats — Get user's contribution stats + access level
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getUserQBStats,
  getUserExamProfile,
  computeAccessInfo,
  incrementViewCount,
} from '@neram/database';

async function requireAuth(
  req: NextRequest,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();
    const dbUser = await getUserByFirebaseUid(decoded.uid, adminClient);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return { userId: dbUser.id };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const adminClient = getSupabaseAdminClient();
    const [profile, stats] = await Promise.all([
      getUserExamProfile(auth.userId, adminClient),
      getUserQBStats(auth.userId, adminClient),
    ]);

    const accessInfo = computeAccessInfo(profile, stats);

    return NextResponse.json({ data: accessInfo });
  } catch (error) {
    console.error('Error fetching QB stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

/**
 * POST /api/questions/qb-stats — Increment view count
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const adminClient = getSupabaseAdminClient();
    await incrementViewCount(auth.userId, adminClient);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error incrementing view:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
