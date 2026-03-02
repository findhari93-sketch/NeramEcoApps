/**
 * Question Bank API - Edit Request
 *
 * POST /api/questions/[id]/edit-request - Create an edit request for a question
 * GET  /api/questions/[id]/edit-request - Get user's pending requests for this question
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  createEditRequest,
  getUserPendingRequests,
  getQuestionById,
  dispatchNotification,
} from '@neram/database';

async function requireAuth(
  req: NextRequest,
): Promise<{ userId: string; userName: string } | NextResponse> {
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
    return { userId: dbUser.id, userName: dbUser.name || 'Unknown' };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
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
    const { proposed_title, proposed_body, proposed_category, proposed_image_urls, proposed_tags } = body;

    if (!proposed_title || typeof proposed_title !== 'string' || proposed_title.trim().length < 5) {
      return NextResponse.json(
        { error: 'Title must be at least 5 characters' },
        { status: 400 },
      );
    }

    if (!proposed_body || typeof proposed_body !== 'string' || proposed_body.trim().length < 20) {
      return NextResponse.json(
        { error: 'Body must be at least 20 characters' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseAdminClient();

    const changeRequest = await createEditRequest(
      auth.userId,
      id,
      {
        proposed_title: proposed_title.trim(),
        proposed_body: proposed_body.trim(),
        proposed_category: proposed_category || undefined,
        proposed_image_urls: proposed_image_urls || undefined,
        proposed_tags: proposed_tags || undefined,
      },
      adminClient,
    );

    // Dispatch notification for the edit request
    const question = await getQuestionById(id, undefined, adminClient);
    dispatchNotification({
      type: 'question_edit_requested',
      title: 'Question Edit Requested',
      message: `${auth.userName} requested to edit "${question?.title || 'a question'}"`,
      data: {
        user_name: auth.userName,
        question_title: question?.title || 'Untitled',
        question_id: id,
        change_request_id: changeRequest.id,
      },
    }).catch((err) => console.error('Failed to dispatch edit request notification:', err));

    return NextResponse.json({ data: changeRequest }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating edit request:', error);
    const status = error.message?.includes('only edit your own') ? 403
      : error.message?.includes('already have a pending') ? 409
      : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to create edit request' },
      { status },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const adminClient = getSupabaseAdminClient();
    const requests = await getUserPendingRequests(auth.userId, id, adminClient);

    return NextResponse.json({ data: requests });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending requests' },
      { status: 500 },
    );
  }
}
