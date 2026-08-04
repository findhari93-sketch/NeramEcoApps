import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  gradePlacedChapterAttempt,
  getStudyVideoState,
} from '@neram/database';
import { getRequestUser, isStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * POST /api/study-materials/files/[id]/test/attempt
 * Student submits { answers: { [questionId]: 'a'|'b'|'c'|'d' } }.
 *
 * Grades through the unified engine, which records a nexus_test_attempts row and
 * fires the study_file side-effect (nexus_study_mark_completed) on a pass, so
 * chapter completion and the teacher dashboard behave exactly as before while
 * the attempt now lands in the same table as every other test in the app.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (isStaff(user)) {
      return NextResponse.json({ error: 'Only students take tests' }, { status: 403 });
    }

    // Re-check the student may see this file before accepting an attempt.
    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const folder = await getFolderById(file.folder_id);
    if (!folder) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const exams = await getStudentExamSet(user.id);
    if (!isFolderVisibleToStudent(folder, exams, user.student_program)) {
      return NextResponse.json({ error: 'Not available' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const answers = (body?.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, string>;

    const video = await getStudyVideoState(params.id, user.id);

    // The video gate, asserted here and not only on the GET. The GET returning
    // `locked` keeps the button off the screen; this keeps the attempt out of
    // the database, which is the part that matters.
    if (video.requires_video && !video.video_completed_at) {
      return NextResponse.json(
        { error: 'Watch one of the class recordings before taking the test.', code: 'VIDEO_REQUIRED' },
        { status: 403 },
      );
    }

    // Practice, not a result. Only offered on a chapter the student has already
    // completed; asking for it before then is refused rather than quietly
    // downgraded, because a client that gets this wrong would otherwise lose the
    // student a real attempt.
    const wantsRevision = body?.mode === 'revision';
    if (wantsRevision && !video.completed_at) {
      return NextResponse.json(
        { error: 'Revision opens once you have completed this chapter.', code: 'NOT_COMPLETED' },
        { status: 403 },
      );
    }

    const result = await gradePlacedChapterAttempt(
      params.id,
      user.id,
      answers,
      wantsRevision ? 'revision' : 'official',
    );
    return NextResponse.json({ result, mode: wantsRevision ? 'revision' : 'official' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit test';
    if (message === 'NO_TEST_LINKED') {
      return NextResponse.json({ error: 'No test is linked to this chapter yet.' }, { status: 404 });
    }
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
