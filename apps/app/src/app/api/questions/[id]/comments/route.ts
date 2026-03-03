export const dynamic = 'force-dynamic';

/**
 * Question Bank API - Question Comments
 *
 * GET  /api/questions/[id]/comments - Get threaded comments (optional auth for user_has_liked)
 * POST /api/questions/[id]/comments - Add a comment (requires auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getQuestionComments,
  createComment,
} from '@neram/database';

// ---------------------------------------------------------------------------
// Auth helpers
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
// GET /api/questions/[id]/comments
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
    const comments = await getQuestionComments(id, userId, adminClient);

    return NextResponse.json({ data: comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/questions/[id]/comments
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { body: commentBody, parentId } = body;

    if (
      !commentBody ||
      typeof commentBody !== 'string' ||
      commentBody.trim().length === 0
    ) {
      return NextResponse.json(
        { error: 'Comment body is required' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseAdminClient();
    const comment = await createComment(
      auth.userId,
      {
        question_id: id,
        body: commentBody.trim(),
        parent_id: parentId || null,
      },
      adminClient,
    );

    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 },
    );
  }
}