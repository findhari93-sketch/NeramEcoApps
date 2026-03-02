/**
 * Question Bank API - Delete Request
 *
 * POST /api/questions/[id]/delete-request - Create a delete request for a question
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  createDeleteRequest,
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
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'Reason must be at least 5 characters' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseAdminClient();

    const changeRequest = await createDeleteRequest(
      auth.userId,
      id,
      reason.trim(),
      adminClient,
    );

    // Dispatch notification for the delete request
    const question = await getQuestionById(id, undefined, adminClient);
    dispatchNotification({
      type: 'question_delete_requested',
      title: 'Question Delete Requested',
      message: `${auth.userName} requested to delete "${question?.title || 'a question'}"`,
      data: {
        user_name: auth.userName,
        question_title: question?.title || 'Untitled',
        question_id: id,
        change_request_id: changeRequest.id,
        reason: reason.trim(),
      },
    }).catch((err) => console.error('Failed to dispatch delete request notification:', err));

    return NextResponse.json({ data: changeRequest }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating delete request:', error);
    const status = error.message?.includes('only delete your own') ? 403
      : error.message?.includes('already have a pending') ? 409
      : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to create delete request' },
      { status },
    );
  }
}
