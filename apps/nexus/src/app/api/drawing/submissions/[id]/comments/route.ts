import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getDrawingSubmissionComments, addDrawingSubmissionComment } from '@neram/database/queries/nexus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const comments = await getDrawingSubmissionComments(id);
    return NextResponse.json({ comments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load comments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;
    const body = await request.json();
    const { comment_text } = body;

    if (!comment_text?.trim()) {
      return NextResponse.json({ error: 'Comment text required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const authorRole = ['teacher', 'admin'].includes(user.user_type) ? 'teacher' : 'student';

    const comment = await addDrawingSubmissionComment({
      submission_id: id,
      author_id: user.id,
      author_role: authorRole,
      comment_text: comment_text.trim(),
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add comment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
