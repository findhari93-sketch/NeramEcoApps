import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getExam,
  getPlacementById,
  getStudentTestAttemptReview,
  getSupabaseAdminClient,
} from '@neram/database';

/**
 * GET /api/student/tests/[testId]/attempts?placement_id=<uuid>   (student, self only)
 *
 * A student's own attempt history: every sitting, replayed question by
 * question. Until now they saw the review once, in the moments after
 * submitting, and it was gone the instant they pressed Try again or navigated
 * away.
 *
 * DELIBERATELY A SEPARATE ROUTE from the staff one, rather than the staff route
 * with a studentId parameter. The authorisation models are different (staff on
 * a classroom, versus self and only self) and merging them is precisely how a
 * student ends up reading a classmate's response sheet. Both call the same
 * getStudentTestAttemptReview, so there is one implementation behind two doors.
 *
 * The student id comes from the verified token and is never read from the URL
 * or the body.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { testId: string } },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: me } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const placementId = request.nextUrl.searchParams.get('placement_id');

    let passingPct: number | null = null;
    let placement: any = null;
    if (placementId) {
      placement = await getPlacementById(placementId, supabase);
      if (!placement || placement.test_id !== params.testId) {
        return NextResponse.json({ error: 'That run is not on this paper' }, { status: 404 });
      }
      passingPct = placement.passing_pct ?? null;
    }

    /**
     * THE ANSWER-KEY GATE.
     *
     * An exam's per-question review is the answer key. Handing it back before
     * results are published, or while the window is still open, would let one
     * student who has finished feed the paper to everyone still sitting it.
     * nexus_exams.results_state exists for exactly this decision, and this
     * route is the one place it can leak, because the staff route is staff-only
     * and the post-submit screen only ever shows an attempt just submitted.
     *
     * Class tests and practice reveal immediately, matching what the chapter
     * test path already does: retry-until-pass is the whole point there, and
     * seeing what you got wrong is how that works.
     */
    if (placement?.context_type === 'exam') {
      const examId = (placement.gating as { exam_id?: string } | null)?.exam_id;
      const exam = examId ? await getExam(examId) : null;
      const stillOpen = exam?.closes_at ? new Date(exam.closes_at) > new Date() : false;
      if (!exam || exam.results_state === 'unpublished' || stillOpen) {
        return NextResponse.json({
          data: {
            test: null,
            attempts: [],
            student: me,
            code: 'RESULTS_NOT_PUBLISHED',
            message: stillOpen
              ? 'Your answers open up once the exam has finished.'
              : 'Your teacher has not published the results for this exam yet.',
          },
        });
      }
    }

    const review = await getStudentTestAttemptReview(
      { testId: params.testId, studentId: (me as any).id, placementId, passingPct },
      supabase,
    );

    return NextResponse.json(
      { data: { test: review.test, attempts: review.attempts, student: me } },
      { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your attempts';
    console.error('Student attempt history error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
