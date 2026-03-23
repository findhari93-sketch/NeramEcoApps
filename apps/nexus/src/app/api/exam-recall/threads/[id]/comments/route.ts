import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  listExamRecallComments,
  createExamRecallComment,
} from '@neram/database/queries';

/**
 * GET /api/exam-recall/threads/[id]/comments
 *
 * List all comments for a thread.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const comments = await listExamRecallComments(id);

    return NextResponse.json({ comments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list comments';
    console.error('[exam-recall/threads/[id]/comments] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/exam-recall/threads/[id]/comments
 *
 * Add a comment to a thread.
 * Body: { body, parent_comment_id? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const reqBody = await request.json();
    const { body: commentBody, parent_comment_id } = reqBody;

    if (!commentBody || !commentBody.trim()) {
      return NextResponse.json({ error: 'Missing required field: body' }, { status: 400 });
    }

    const isStaff = ['teacher', 'admin'].includes(user.user_type ?? '');

    const comment = await createExamRecallComment({
      thread_id: id,
      user_id: user.id,
      body: commentBody,
      is_staff: isStaff,
      parent_comment_id: parent_comment_id || null,
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create comment';
    console.error('[exam-recall/threads/[id]/comments] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
