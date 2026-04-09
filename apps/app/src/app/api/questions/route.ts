export const dynamic = 'force-dynamic';

/**
 * Question Bank API - List & Create Questions
 *
 * GET  /api/questions - List approved questions (optional auth for user_has_liked)
 * POST /api/questions - Create a new question (requires auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getApprovedQuestions,
  createQuestionPost,
  dispatchNotification,
  type NataQuestionCategory,
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
// GET /api/questions
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const examType = searchParams.get('examType') || undefined;
    const category = (searchParams.get('category') as any) || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const sortBy =
      (searchParams.get('sortBy') as 'newest' | 'most_voted') || 'newest';

    // Optional auth — enrich response with user_has_liked when logged-in
    const userId = await getOptionalUserId(req);

    const adminClient = getSupabaseAdminClient();
    const { data, count } = await getApprovedQuestions(
      { examType, category, page, limit, sortBy, userId },
      adminClient,
    );

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('Error listing questions:', error);
    return NextResponse.json(
      { error: 'Failed to list questions' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/questions
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { title, body: questionBody, category, examType, examYear, examMonth, examSession, tags, confidenceLevel, imageUrls } = body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 },
      );
    }
    if (
      !questionBody ||
      typeof questionBody !== 'string' ||
      questionBody.trim().length === 0
    ) {
      return NextResponse.json(
        { error: 'Body is required' },
        { status: 400 },
      );
    }
    if (
      !category ||
      typeof category !== 'string' ||
      category.trim().length === 0
    ) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 },
      );
    }

    // Check if user is admin (for auto-approve)
    const adminClient = getSupabaseAdminClient();
    const { data: dbUser } = await adminClient
      .from('users')
      .select('user_type')
      .eq('id', auth.userId)
      .single() as unknown as { data: { user_type: string } | null };
    const isAdmin = dbUser?.user_type === 'admin';

    const now = new Date();
    const question = await createQuestionPost(
      auth.userId,
      {
        title: title.trim(),
        body: questionBody.trim(),
        category: category.trim() as NataQuestionCategory,
        exam_type: examType || 'NATA',
        exam_year: examYear || now.getFullYear(),
        exam_month: examMonth || (now.getMonth() + 1),
        exam_session: examSession || null,
        tags: tags || [],
        image_urls: Array.isArray(imageUrls) ? imageUrls : [],
        confidence_level: confidenceLevel ? Math.min(5, Math.max(1, Number(confidenceLevel))) : 3,
      },
      isAdmin,
      adminClient,
    );

    // Dispatch notification for non-admin posts
    if (!isAdmin) {
      const { data: authorUser } = await adminClient
        .from('users')
        .select('name')
        .eq('id', auth.userId)
        .single() as unknown as { data: { name: string } | null };

      dispatchNotification(
        {
          type: 'question_submitted',
          title: 'New Question Submitted',
          message: `${authorUser?.name || 'A user'} submitted: "${title.trim().substring(0, 50)}${title.trim().length > 50 ? '...' : ''}"`,
          data: {
            question_id: question.id,
            question_title: title.trim(),
            category,
            user_id: auth.userId,
            user_name: authorUser?.name || 'Unknown',
          },
        },
        adminClient,
      ).catch((err: unknown) => console.error('Notification dispatch error:', err));
    }

    return NextResponse.json({ data: question }, { status: 201 });
  } catch (error) {
    console.error('Error creating question:', error);
    return NextResponse.json(
      { error: 'Failed to create question' },
      { status: 500 },
    );
  }
}