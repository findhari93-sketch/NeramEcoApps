/**
 * POST /api/question-bank/student-papers/[id]/drill
 *
 * The quick drill: a short random slice of one paper, sat in the same player as
 * everything else.
 *
 * Composed server-side rather than by the browser, even though the custom-test
 * route could already have done this, because that route takes question_ids and
 * the client would have to enumerate all 62 of a paper's questions just to pick
 * 15. Handing the whole id list to the browser to throw most of it away is both
 * wasteful and a wider answer than the question deserves.
 *
 * The result is an ordinary 'student_custom' test with no placement, so it can
 * never be confused with the paper's official mock and never touches the record
 * the mock keeps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, messageOf } from '@/lib/api-errors';
import { refuseUnlessStudent, verifyQBAccess } from '@/lib/qb-auth';
import { composeTest, getPaperById, getPaperQuestionIds, paperTitles } from '@neram/database';
import { MAX_STUDENT_TEST_QUESTIONS } from '@/lib/test-limits';

/** What "quick" means when the client does not say. */
const DEFAULT_DRILL_SIZE = 15;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      classroom_id?: string;
      count?: number;
      timed?: boolean;
    };

    const access = await verifyQBAccess(request.headers.get('Authorization'), body.classroom_id);
    if (!access.ok) return access.response;

    // The row is stamped created_by_student, so the caller has to be one.
    // Without this a teacher pressing the button in a student preview lands in
    // the teacher hub's "Student tests" list.
    const notAStudent = refuseUnlessStudent(access.caller);
    if (notAStudent) return notAStudent;

    const paper = await getPaperById(params.id);
    if (!paper || !paper.is_student_visible) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    const questionIds = await getPaperQuestionIds(paper);
    if (questionIds.length === 0) {
      return NextResponse.json(
        { error: 'This paper has no questions to practise yet.' },
        { status: 400 },
      );
    }

    const requested = Number(body.count);
    const size = Math.min(
      Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : DEFAULT_DRILL_SIZE,
      MAX_STUDENT_TEST_QUESTIONS,
      questionIds.length,
    );

    // Fisher-Yates over a copy. Sorting by random() is the usual shortcut and is
    // measurably biased, which matters here because a drill a student repeats
    // should not keep offering the same questions first.
    const pool = [...questionIds];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, size);

    const { short_title } = paperTitles(paper);
    const timed = body.timed !== false;

    const { id } = await composeTest({
      title: `${short_title} quick drill`,
      description: `${size} questions drawn at random from ${paperTitles(paper).title}.`,
      questionIds: picked,
      testKind: 'student_custom',
      // A minute a question. Predictable enough that a student can decide
      // whether they have time for it before they start.
      timerType: timed ? 'full' : 'none',
      durationMinutes: timed ? size : null,
      isPublished: true,
      isRepository: false,
      createdBy: access.caller.id,
      createdByStudent: access.caller.id,
      classroomId: body.classroom_id ?? null,
      sourceFilters: {
        exam_type: paper.exam_type,
        year: paper.year,
        session: paper.session,
        selection: 'select_all',
        matched_count: questionIds.length,
      },
    });

    return NextResponse.json(
      { data: { test_id: id, question_count: size, duration_minutes: timed ? size : null } },
      { status: 201 },
    );
  } catch (err) {
    const detail = messageOf(err);
    console.error('[QB Paper Drill] POST:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}
