import { NextRequest, NextResponse } from 'next/server';
import { resolveStudyThread } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * POST /api/study-materials/feedback/resolve  (staff)
 * Body: { file_id, visibility: 'public'|'private', thread_student_id: string | null }
 * Marks every unresolved student comment in that thread resolved.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    const fileId = typeof body?.file_id === 'string' ? body.file_id : null;
    const visibility = body?.visibility === 'private' ? 'private' : 'public';
    const threadStudentId =
      typeof body?.thread_student_id === 'string' ? body.thread_student_id : null;

    if (!fileId) {
      return NextResponse.json({ error: 'file_id is required' }, { status: 400 });
    }
    if (visibility === 'private' && !threadStudentId) {
      return NextResponse.json(
        { error: 'thread_student_id is required for a private thread' },
        { status: 400 },
      );
    }

    await resolveStudyThread(
      { file_id: fileId, visibility, thread_student_id: visibility === 'private' ? threadStudentId : null },
      user.id,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve thread';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
