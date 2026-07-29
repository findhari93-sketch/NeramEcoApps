import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import {
  getSupabaseAdminClient,
  getClassPrepTest,
  getComposedTestQuestions,
  gradeTestOneShot,
  recomputeClassPrep,
} from '@neram/database';
import { seededShuffle, attemptSeed } from '@/lib/seeded-shuffle';

/**
 * The prep test a student takes before a class.
 *
 * Enforcement discipline, copied from the catch-up test route because the lesson
 * generalises: a disabled button is a suggestion.
 *   1. GET refuses anyone without an active enrolment in the class's classroom.
 *   2. POST resolves the placement ITSELF and never trusts a client-supplied
 *      placement_id, so a student cannot point the grader at a different, easier
 *      placement and have its side-effect fire.
 *   3. gradeTestOneShot asserts the placement belongs to the test.
 *
 * Unlike the catch-up test there is no unlock state and no re-lock on failure.
 * The rule here is retry until you pass: the point is arriving prepared, not
 * measuring how few tries it took. Attempt count is recorded and shown to the
 * teacher, which is where that signal belongs.
 */

interface Ctx {
  params: { classId: string };
}

interface Resolved {
  userId: string;
  classroomId: string;
  placementId: string;
  testId: string;
  passingPct: number;
  questionCount: number;
  attemptNumber: number;
}

async function resolve(
  supabase: any,
  msOid: string,
  classId: string,
): Promise<Resolved | { error: NextResponse }> {
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msOid).single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, status')
    .eq('id', classId)
    .maybeSingle();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };

  // Enrolment is the check. The catch-up route can lean on a nexus_class_absences
  // row, but a prep test applies to everyone on the roster, so there is no
  // per-student row to key off before they start.
  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', cls.classroom_id)
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) {
    return { error: NextResponse.json({ error: 'Not enrolled in this class' }, { status: 403 }) };
  }

  const prep = await getClassPrepTest(classId, supabase);
  if (!prep) {
    return {
      error: NextResponse.json(
        { error: 'There is no test set for this class.', code: 'NO_PREP_TEST' },
        { status: 404 },
      ),
    };
  }

  const { count } = await supabase
    .from('nexus_test_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('test_id', prep.test_id)
    .eq('student_id', user.id)
    .eq('status', 'submitted');

  return {
    userId: user.id,
    classroomId: cls.classroom_id,
    placementId: prep.placement_id,
    testId: prep.test_id,
    passingPct: prep.passing_pct,
    questionCount: prep.question_count,
    attemptNumber: (count || 0) + 1,
  };
}

/**
 * GET /api/student/class-prep/[classId]/test
 * The paper, without answers.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const r = await resolve(supabase, msUser.oid, params.classId);
    if ('error' in r) return r.error;

    // withAnswers false, so neither correct_answer nor answer_tolerance is in the
    // payload. The tolerance matters: it narrows the search space for a guesser.
    const questions = await getComposedTestQuestions(r.testId, false, supabase);

    // Stable within an attempt, different on the next one. A mid-attempt refresh
    // must not reshuffle the paper under the student.
    const ordered = seededShuffle(questions, attemptSeed(r.userId, r.testId, r.attemptNumber));

    // Recompute on open so the timetable's locked panel and this page cannot
    // disagree about how many attempts have happened.
    const state = await recomputeClassPrep(r.userId, params.classId, supabase);

    return NextResponse.json({
      test_id: r.testId,
      questions: ordered,
      passing_pct: r.passingPct,
      question_count: r.questionCount,
      must_get_right: Math.ceil((r.passingPct / 100) * r.questionCount),
      attempt_number: r.attemptNumber,
      best_pct: state?.test_best_pct ?? null,
      passed: !!state?.test_passed_at,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to load the test');
  }
}

/**
 * POST /api/student/class-prep/[classId]/test
 * Body: { answers: { [question_id]: string } }
 *
 * No 409 on resubmit. Retry until pass is the rule, so a second attempt is not
 * an error condition, unlike the legacy /api/tests/attempt engine which refuses.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdminClient() as any;

    const r = await resolve(supabase, msUser.oid, params.classId);
    if ('error' in r) return r.error;

    const answers = body?.answers && typeof body.answers === 'object' ? body.answers : {};

    const result = await gradeTestOneShot(
      {
        testId: r.testId,
        studentId: r.userId,
        answers,
        // Resolved server side, never read from the request. A client-supplied
        // placement id is how you point the grader at somebody else's gate.
        placementId: r.placementId,
      },
      supabase,
    );

    // gradeTestOneShot already recomputes via the class_prep_test branch. Read
    // the row back rather than recomputing twice, so the response reports exactly
    // what was stored.
    const { data: state } = await supabase
      .from('nexus_class_prep_state')
      .select('test_best_pct, test_attempts, test_passed_at, unlocked_at, unlocked_via')
      .eq('student_id', r.userId)
      .eq('scheduled_class_id', params.classId)
      .maybeSingle();

    return NextResponse.json({
      ...result,
      attempt_number: r.attemptNumber,
      best_pct: state?.test_best_pct ?? result.percentage,
      total_attempts: state?.test_attempts ?? r.attemptNumber,
      // What the student actually cares about: may they join now.
      unlocked: !!state?.unlocked_at,
    });
  } catch (err) {
    // The grader's own guard: a placement that does not belong to the test it was
    // handed. Everything else, including a missing Authorization header, is
    // classified by errorResponse so an unauthenticated call is a 401 and not a
    // 500 that looks like the server broke.
    if (err instanceof Error && err.message === 'PLACEMENT_TEST_MISMATCH') {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err, 'Failed to submit the test');
  }
}
