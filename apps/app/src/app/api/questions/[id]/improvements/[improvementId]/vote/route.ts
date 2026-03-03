export const dynamic = 'force-dynamic';

/**
 * Question Bank API - Vote on Improvement
 *
 * POST /api/questions/[id]/improvements/[improvementId]/vote
 * Body: { vote: "up" | "down" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  voteOnImprovement,
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; improvementId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { improvementId } = await params;
    const body = await req.json();
    const { vote } = body;

    if (!vote || !['up', 'down'].includes(vote)) {
      return NextResponse.json(
        { error: 'Vote must be "up" or "down"' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseAdminClient();
    const result = await voteOnImprovement(improvementId, auth.userId, vote, adminClient);

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Error voting on improvement:', error);
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 });
  }
}