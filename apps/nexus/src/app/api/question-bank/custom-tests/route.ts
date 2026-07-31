import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { composeTest, getTestFolderById } from '@neram/database';

/**
 * POST /api/question-bank/custom-tests
 * Student creates a custom practice test from QB questions.
 * Thin caller over the shared composeTest core (also used by the teacher builder).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, question_ids, timer_type, duration_minutes, per_question_seconds, classroom_id } = body;

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroom_id);
    if (!access.ok) return access.response;
    const { caller } = access;

    // A student may file their paper only in their own tree. Without this check
    // a crafted folder_id would drop a student's test into the staff library.
    let folderId: string | null = null;
    if (typeof body?.folder_id === 'string' && body.folder_id) {
      const folder = await getTestFolderById(body.folder_id);
      if (!folder || folder.owner_scope !== 'student' || folder.owner_id !== caller.id) {
        return NextResponse.json({ error: 'That folder is not yours' }, { status: 403 });
      }
      folderId = folder.id;
    }

    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      return NextResponse.json({ error: 'question_ids must be a non-empty array' }, { status: 400 });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const { id } = await composeTest({
      title,
      questionIds: question_ids,
      timerType: timer_type,
      durationMinutes: duration_minutes ?? null,
      perQuestionSeconds: per_question_seconds ?? null,
      isPublished: true, // immediately available to the student
      isRepository: false,
      testKind: 'student_custom',
      createdBy: caller.id,
      createdByStudent: caller.id,
      classroomId: classroom_id ?? null,
      folderId,
    });

    return NextResponse.json(
      { data: { test_id: id, title: title.trim(), question_count: question_ids.length } },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create custom test';
    console.error('Custom test POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
