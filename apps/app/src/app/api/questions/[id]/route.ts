export const dynamic = 'force-dynamic';

/**
 * Question Bank API - Single Question
 *
 * GET /api/questions/[id] - Get a single question by ID (optional auth for user_has_liked)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getQuestionById,
} from '@neram/database';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getOptionalUserId(req: NextRequest): Promise<string | undefined> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();
    const dbUser = await getUserByFirebaseUid(decoded.uid, adminClient);
    return dbUser?.id;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// GET /api/questions/[id]
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 },
      );
    }

    const userId = await getOptionalUserId(req);

    const adminClient = getSupabaseAdminClient();
    const question = await getQuestionById(id, userId, adminClient);

    if (!question) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: question });
  } catch (error) {
    console.error('Error fetching question:', error);
    return NextResponse.json(
      { error: 'Failed to fetch question' },
      { status: 500 },
    );
  }
}