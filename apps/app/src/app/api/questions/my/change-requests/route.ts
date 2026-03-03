export const dynamic = 'force-dynamic';

/**
 * Question Bank API - User's Change Requests
 *
 * GET /api/questions/my/change-requests - Get all user's change requests (any status)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getUserChangeRequests,
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
    const requests = await getUserChangeRequests(auth.userId, adminClient);

    return NextResponse.json({ data: requests });
  } catch (error) {
    console.error('Error fetching user change requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch change requests' },
      { status: 500 },
    );
  }
}