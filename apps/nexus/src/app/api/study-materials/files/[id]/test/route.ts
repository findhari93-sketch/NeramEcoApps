import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  getPlacedChapterTest,
  getPlacedTestForStudent,
  linkTestToStudyFile,
  unlinkTestFromStudyFile,
} from '@neram/database';
import { getRequestUser, isStaff, assertStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * The test linked to a study chapter.
 *
 *   GET    -> staff: which test is linked, if any.
 *             student: the paper to take, answers stripped. null when none.
 *   POST   -> staff: LINK a library test. Body { test_id, passing_pct? }.
 *   DELETE -> staff: unlink. The test and its attempts survive.
 *
 * Authoring moved to the Tests module. A chapter test is now an ordinary
 * repository test placed here, which is what lets one paper serve a chapter, a
 * class and a practice pool without being written three times.
 */

async function assertStudentCanSee(userId: string, studentProgram: string | null, fileId: string) {
  const file = await getFileById(fileId);
  if (!file) throw new Error('File not found');
  const folder = await getFolderById(file.folder_id);
  if (!folder) throw new Error('File not found');
  const exams = await getStudentExamSet(userId);
  if (!isFolderVisibleToStudent(folder, exams, studentProgram)) throw new Error('Not authorized');
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (isStaff(user)) {
      const test = await getPlacedChapterTest(params.id);
      return NextResponse.json({ test });
    }
    await assertStudentCanSee(user.id, user.student_program, params.id);
    const test = await getPlacedTestForStudent(params.id);
    return NextResponse.json({ test });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load test';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    const testId = typeof body?.test_id === 'string' ? body.test_id.trim() : '';
    if (!testId) {
      return NextResponse.json(
        { error: 'Pick a test from the library. Build one in Tests first if you have none.' },
        { status: 400 },
      );
    }

    const test = await linkTestToStudyFile({
      fileId: params.id,
      testId,
      passingPct: body?.passing_pct,
      createdBy: user.id,
    });
    return NextResponse.json({ test });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to link the test';
    if (message === 'TEST_NOT_FOUND') {
      return NextResponse.json({ error: 'That test no longer exists.' }, { status: 400 });
    }
    if (message === 'TEST_HAS_NO_QUESTIONS') {
      return NextResponse.json({ error: 'That test has no questions yet.' }, { status: 400 });
    }
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    await unlinkTestFromStudyFile(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to unlink the test';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
