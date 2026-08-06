import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  getPlacedChapterTest,
  getPlacedTestForStudent,
  getStudyVideoState,
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

    // A chapter with a servable video track is not takeable until one language
    // has been watched through. This is the read-side gate only: the attempt
    // route re-asserts it, because a GET returning null is a hint to the UI, not
    // a boundary.
    const video = await getStudyVideoState(params.id, user.id);
    if (video.requires_video && !video.video_completed_at) {
      return NextResponse.json({ test: null, locked: true, reason: 'video_required' });
    }

    /**
     * `?meta=1`: which test this is, and nothing else.
     *
     * For a caller about to hand the chapter to the player, which needs the
     * test id and the placement id and will fetch the paper itself. Kept
     * separate from the branch below on purpose, because that one COMPOSES the
     * whole paper and DECIDES AND STORES the draw for this sitting. Fixing a
     * draw from a "which test is this" call would pin a paper the student may
     * never open, and ship fifty questions to a caller that wants two ids.
     */
    if (request.nextUrl.searchParams.get('meta') === '1') {
      const placed = await getPlacedChapterTest(params.id);
      return NextResponse.json({
        test: placed && placed.is_published ? placed : null,
        locked: false,
      });
    }

    // Per student: a pooled chapter test draws its own subset for each sitting,
    // and the draw is fixed here so the paper they answer is the paper they are
    // graded against.
    const test = await getPlacedTestForStudent(params.id, user.id);
    return NextResponse.json({ test, locked: false });
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
