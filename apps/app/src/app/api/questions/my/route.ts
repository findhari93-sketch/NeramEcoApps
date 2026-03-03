export const dynamic = 'force-dynamic';

/**
 * Question Bank API - User's Own Questions
 *
 * GET /api/questions/my - Get questions posted by the authenticated user (all statuses)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getUserQuestions,
} from '@neram/database';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAuth(
  req: NextRequest,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();
    const dbUser = await getUserByFirebaseUid(decoded.uid, adminClient);
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return { userId: dbUser.id };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/questions/my
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const adminClient = getSupabaseAdminClient();
    const questions = await getUserQuestions(auth.userId, adminClient);

    return NextResponse.json({ data: questions });
  } catch (error) {
    console.error('Error fetching user questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch your questions' },
      { status: 500 },
    );
  }
}