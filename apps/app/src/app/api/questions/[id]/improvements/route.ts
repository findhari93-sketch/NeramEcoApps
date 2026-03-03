export const dynamic = 'force-dynamic';

/**
 * Question Bank API - Improvements
 *
 * GET  /api/questions/[id]/improvements - List approved improvements
 * POST /api/questions/[id]/improvements - Submit a new improvement (requires auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getImprovements,
  createImprovement,
} from '@neram/database';

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getOptionalUserId(req);
    const adminClient = getSupabaseAdminClient();
    const improvements = await getImprovements(id, userId, adminClient);
    return NextResponse.json({ data: improvements });
  } catch (error) {
    console.error('Error fetching improvements:', error);
    return NextResponse.json({ error: 'Failed to fetch improvements' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json();
    const { body: improvementBody, imageUrls } = body;

    if (!improvementBody || typeof improvementBody !== 'string' || improvementBody.trim().length < 20) {
      return NextResponse.json(
        { error: 'Improvement must be at least 20 characters' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseAdminClient();
    const improvement = await createImprovement(
      auth.userId,
      {
        question_id: id,
        body: improvementBody.trim(),
        image_urls: imageUrls || [],
      },
      adminClient,
    );

    return NextResponse.json({ data: improvement }, { status: 201 });
  } catch (error) {
    console.error('Error creating improvement:', error);
    return NextResponse.json({ error: 'Failed to create improvement' }, { status: 500 });
  }
}