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
  getUserExamProfile,
  getUserQBStats,
  computeAccessInfo,
} from '@neram/database';

const PREVIEW_CHARS = 160;

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

    // The "contribute to unlock" blur used to be CSS only: the full body was
    // in this response for anyone. Only students with full access (or the
    // author) get the body and images; everyone else gets a short preview.
    let full = !!userId && question.user_id === userId;
    if (!full && userId) {
      const [profile, stats] = await Promise.all([getUserExamProfile(userId, adminClient), getUserQBStats(userId, adminClient)]);
      full = computeAccessInfo(profile, stats).accessLevel === 'full';
    }
    if (!full) {
      const body = String(question.body ?? '');
      return NextResponse.json({
        data: {
          ...question,
          body: body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS).trimEnd()}...` : body,
          image_urls: [],
          locked: true,
        },
      });
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