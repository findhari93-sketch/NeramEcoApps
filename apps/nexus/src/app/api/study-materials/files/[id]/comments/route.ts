import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  listFileCommentsForStaff,
  listFileCommentsForStudent,
  addFileComment,
  softDeleteComment,
  getSupabaseAdminClient,
} from '@neram/database';
import { createAdminNotification } from '@neram/database/queries';
import { getRequestUser, isStaff, assertStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * GET /api/study-materials/files/[id]/comments
 * Load the comment threads a viewer may see on a file.
 *   - staff: every non-deleted comment (public class stream + all private threads)
 *   - student: public class stream + their own private thread only
 * Re-checks the student's audience (defence in depth) before returning anything.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const folder = await getFolderById(file.folder_id);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const staff = isStaff(user);
    if (!staff) {
      const examSet = await getStudentExamSet(user.id);
      if (!isFolderVisibleToStudent(folder, examSet, user.student_program)) {
        return NextResponse.json({ error: 'Not available' }, { status: 403 });
      }
    }

    const comments = staff
      ? await listFileCommentsForStaff(params.id)
      : await listFileCommentsForStudent(params.id, user.id);

    return NextResponse.json({ comments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load comments';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/study-materials/files/[id]/comments
 * Body: { body: string, visibility: 'public' | 'private', thread_student_id?: string }
 * thread_student_id is server-authoritative: a student's private comment always threads under
 * themselves; a teacher's private reply must name the (validated) student it replies to.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const raw = await request.json();
    const bodyText = typeof raw?.body === 'string' ? raw.body.trim() : '';
    const visibility = raw?.visibility === 'private' ? 'private' : 'public';

    if (!bodyText) {
      return NextResponse.json({ error: 'Comment text required' }, { status: 400 });
    }

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const folder = await getFolderById(file.folder_id);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const staff = isStaff(user);
    const authorRole = staff ? 'teacher' : 'student';

    // Students may only comment on files inside their audience.
    if (!staff) {
      const examSet = await getStudentExamSet(user.id);
      if (!isFolderVisibleToStudent(folder, examSet, user.student_program)) {
        return NextResponse.json({ error: 'Not available' }, { status: 403 });
      }
    }

    // Resolve thread ownership server-side.
    let threadStudentId: string | null = null;
    if (visibility === 'private') {
      if (staff) {
        const targetId = typeof raw?.thread_student_id === 'string' ? raw.thread_student_id : null;
        if (!targetId) {
          return NextResponse.json(
            { error: 'thread_student_id is required for a private teacher reply' },
            { status: 400 },
          );
        }
        const supabase = getSupabaseAdminClient();
        const { data: target } = await supabase
          .from('users')
          .select('id, user_type')
          .eq('id', targetId)
          .maybeSingle();
        if (!target || target.user_type !== 'student') {
          return NextResponse.json({ error: 'Invalid target student' }, { status: 400 });
        }
        threadStudentId = targetId;
      } else {
        threadStudentId = user.id;
      }
    }

    const comment = await addFileComment({
      file_id: params.id,
      author_id: user.id,
      author_role: authorRole,
      visibility,
      thread_student_id: threadStudentId,
      body: bodyText,
    });

    // Notify staff of new activity (best-effort; a notification failure must not fail the comment).
    try {
      await createAdminNotification({
        event_type: 'study_material_comment_added',
        title: 'New study-materials comment',
        message: `${user.name || 'A user'} commented on "${file.title}"`,
        metadata: {
          file_id: params.id,
          comment_id: comment.id,
          visibility,
          thread_student_id: threadStudentId,
          author_role: authorRole,
        },
      });
    } catch {
      // ignore notification errors
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add comment';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/study-materials/files/[id]/comments?commentId=<id>  (staff moderation)
 * Soft-deletes a single comment so it disappears for students.
 */
export async function DELETE(request: NextRequest, _ctx: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const commentId = request.nextUrl.searchParams.get('commentId');
    if (!commentId) {
      return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
    }

    await softDeleteComment(commentId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete comment';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
