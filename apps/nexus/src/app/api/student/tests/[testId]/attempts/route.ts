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
/**
 * Why an exam door's review is still shut, or null when it may be shown.
 * Fails closed: an exam that cannot be found is treated as unpublished.
 */
async function examReviewLock(placement: { gating?: unknown }): Promise<'open' | 'unpublished' | null> {
  const examId = (placement.gating as { exam_id?: string } | null)?.exam_id;
  const exam = examId ? await getExam(examId) : null;
  if (!exam) return 'unpublished';
  if (exam.closes_at && new Date(exam.closes_at) > new Date()) return 'open';
  if (exam.results_state === 'unpublished') return 'unpublished';
  return null;
}

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
      const lock = await examReviewLock(placement);
      if (lock) {
        return NextResponse.json({
          data: {
            test: null,
            attempts: [],
            student: me,
            code: 'RESULTS_NOT_PUBLISHED',
            message:
              lock === 'open'
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

    /**
     * The same gate for a whole-paper history.
     *
     * Asked without a placement_id (the Performance tab does), the query returns
     * every sitting on the paper, exam sittings included, and the gate above
     * never ran. Each exam door's sittings are dropped until that exam's review
     * would open through its own door.
     */
    let attempts = review.attempts;
    if (!placementId) {
      const doorIds = [...new Set(attempts.map((a) => a.placement_id).filter(Boolean))] as string[];
      const locked = new Set<string>();
      await Promise.all(
        doorIds.map(async (id) => {
          const door = await getPlacementById(id, supabase);
          if (door?.context_type === 'exam' && (await examReviewLock(door))) locked.add(id);
        }),
      );
      attempts = attempts.filter((a) => !a.placement_id || !locked.has(a.placement_id));
    }

    return NextResponse.json(
      { data: { test: review.test, attempts, student: me } },
      { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your attempts';
    console.error('Student attempt history error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
