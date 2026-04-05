import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { deleteDrawingThread, replaceSubmissionImage } from '@neram/database/queries/nexus';

/**
 * DELETE /api/drawing/submissions/thread/manage?question_id=X
 * Delete entire thread (student: own non-completed, teacher: any)
 */
export async function DELETE(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const questionId = request.nextUrl.searchParams.get('question_id');
    const studentId = request.nextUrl.searchParams.get('student_id'); // teacher can specify

    if (!questionId) {
      return NextResponse.json({ error: 'Missing question_id' }, { status: 400 });
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

    const isTeacher = ['teacher', 'admin'].includes(user.user_type);
    const targetStudentId = isTeacher && studentId ? studentId : user.id;

    // Students can't delete completed threads
    if (!isTeacher) {
      const { data: thread } = await supabase
        .from('drawing_thread_status')
        .select('status')
        .eq('student_id', targetStudentId)
        .eq('question_id', questionId)
        .single();

      if (thread?.status === 'completed') {
        return NextResponse.json({ error: 'Cannot delete a completed thread' }, { status: 403 });
      }
    }

    await deleteDrawingThread(targetStudentId, questionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete thread';
    console.error('Thread delete error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/drawing/submissions/thread/manage
 * Replace image on a pending submission
 * Body: { submission_id, new_image_url }
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { submission_id, new_image_url } = body;

    if (!submission_id || !new_image_url) {
      return NextResponse.json({ error: 'Missing submission_id or new_image_url' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify ownership — student can only replace own submission
    const { data: sub } = await supabase
      .from('drawing_submissions')
      .select('student_id, status')
      .eq('id', submission_id)
      .single();

    if (!sub) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    if (sub.student_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (sub.status !== 'submitted') {
      return NextResponse.json({ error: 'Can only replace pending submissions' }, { status: 400 });
    }

    const submission = await replaceSubmissionImage(submission_id, new_image_url);
    return NextResponse.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to replace image';
    console.error('Replace image error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
