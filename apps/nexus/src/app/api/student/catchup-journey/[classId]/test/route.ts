import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getClassTestForClass,
  getComposedTestQuestions,
  gradeTestOneShot,
} from '@neram/database';
import { seededShuffle, attemptSeed } from '@/lib/seeded-shuffle';

/**
 * The 85% class test on a catch-up backlog item.
 *
 * The rule that matters here is "a failed attempt sends you back to the
 * recording before you can try again", and it is enforced in three places
 * rather than one:
 *
 *   1. GET refuses to hand out questions while the test is locked.
 *   2. POST re-checks the lock before grading, so a client still holding
 *      questions from a previous load cannot submit them.
 *   3. The grader itself clears the lock on a failing score, so the rule holds
 *      no matter who grades the attempt.
 *
 * A disabled button is a suggestion. This is the rule.
 *
 * Namespaced under catchup-journey, not catchup: /api/student/catchup is the
 * older topic-level catch-up TRACK (nexus_catchup_tracks, teacher-curated,
 * shared per plan). Different grain, different feature, and nesting these under
 * it would have read as if they belonged to it.
 */

interface Ctx {
  params: { classId: string };
}

interface Resolved {
  userId: string;
  item: any;
  test: { placement_id: string; test_id: string; passing_pct: number; question_count: number };
}

async function resolve(
  supabase: any,
  authorization: string | null,
  classId: string,
): Promise<Resolved | NextResponse> {
  const msUser = await verifyMsToken(authorization);

  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: item } = await supabase
    .from('nexus_class_absences')
    .select('id, student_id, scheduled_class_id, test_unlocked_at, test_passed_at, excused_at')
    .eq('scheduled_class_id', classId)
    .eq('student_id', user.id)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'This class is not on your catch-up list.' }, { status: 404 });
  }

  const test = await getClassTestForClass(classId, supabase);
  if (!test) {
    return NextResponse.json(
      { error: 'Your teacher has not set the test for this class yet.' },
      { status: 404 },
    );
  }

  return { userId: user.id, item, test };
}

/** How many attempts this student has already made, so the paper reshuffles per attempt. */
async function attemptCount(supabase: any, testId: string, studentId: string): Promise<number> {
  const { count } = await supabase
    .from('nexus_test_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('test_id', testId)
    .eq('student_id', studentId);
  return count || 0;
}

/**
 * GET /api/student/catchup-journey/[classId]/test
 * The paper, without answers, in this attempt's order.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const resolved = await resolve(supabase, request.headers.get('Authorization'), params.classId);
    if (resolved instanceof NextResponse) return resolved;
    const { userId, item, test } = resolved;

    if (!item.test_unlocked_at && !item.test_passed_at) {
      return NextResponse.json(
        {
          error: 'TEST_LOCKED',
          message: 'Finish the guided recap to unlock this test.',
        },
        { status: 403 },
      );
    }

    const questions = await getComposedTestQuestions(test.test_id, false, supabase);
    if (questions.length === 0) {
      return NextResponse.json({ error: 'This test has no questions yet.' }, { status: 404 });
    }

    const attemptNumber = (await attemptCount(supabase, test.test_id, userId)) + 1;

    // Needed so a failing result can send the student straight back into the
    // gated recording rather than making them navigate for it.
    const { data: recap } = await supabase
      .from('nexus_class_recaps')
      .select('id')
      .eq('scheduled_class_id', params.classId)
      .eq('status', 'published')
      .maybeSingle();

    return NextResponse.json({
      recap_id: recap?.id ?? null,
      test: {
        id: test.test_id,
        placement_id: test.placement_id,
        passing_pct: test.passing_pct,
        question_count: questions.length,
        // Stated up front so nobody is surprised by the bar after they submit.
        must_get_right: Math.ceil((test.passing_pct / 100) * questions.length),
      },
      attempt_number: attemptNumber,
      passed: !!item.test_passed_at,
      // Stable while this attempt is open, different on the next one.
      questions: seededShuffle(questions, attemptSeed(userId, test.test_id, attemptNumber)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the test';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/student/catchup-journey/[classId]/test
 * body { answers: Record<questionId, optionId> }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const resolved = await resolve(supabase, request.headers.get('Authorization'), params.classId);
    if (resolved instanceof NextResponse) return resolved;
    const { userId, item, test } = resolved;

    // Re-read rather than trusting the row loaded a moment ago: this is the
    // check that stops a client holding questions from a previous attempt.
    const { data: fresh } = await supabase
      .from('nexus_class_absences')
      .select('test_unlocked_at, test_passed_at')
      .eq('id', item.id)
      .maybeSingle();

    if (!fresh?.test_unlocked_at) {
      return NextResponse.json(
        {
          error: 'TEST_LOCKED',
          message: fresh?.test_passed_at
            ? 'You have already passed this class test.'
            : 'Rewatch the class to unlock the test again.',
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const answers = (body?.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<
      string,
      string
    >;

    // The grader owns the consequences: passing clears the class, failing clears
    // the unlock. Neither is duplicated here.
    const result = await gradeTestOneShot(
      {
        testId: test.test_id,
        studentId: userId,
        answers,
        placementId: test.placement_id,
      },
      supabase,
    );

    return NextResponse.json({
      ...result,
      // Where the student goes next. On a fail there is exactly one way forward.
      next: result.passed
        ? { action: 'continue' }
        : { action: 'rewatch', classId: params.classId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit the test';
    console.error('Catch-up class test POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
