import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getComposedTestQuestions,
  getPlacementById,
  getTestMeta,
  saveAttemptAnswers,
  startOrResumeAttempt,
  submitAttempt,
} from '@neram/database';

/**
 * The student take engine.
 *
 * Both methods now delegate to the shared attempt lifecycle in
 * test-repository.ts. This route used to carry its own grader (plain string
 * equality, no numerical tolerance, no exclusion of ungradable questions) and
 * its own attempt bookkeeping, which is how two engines came to disagree about
 * the same paper.
 *
 * The 409 on a second submission is gone with it. A student may sit a test as
 * often as they like; each go is its own attempt row with its own number, and
 * a placement that genuinely wants one shot sets gating.attempt_limit.
 */

/** Map a domain error onto the status and sentence the client should show. */
function attemptError(message: string): NextResponse | null {
  switch (message) {
    case 'TEST_NOT_FOUND':
      return NextResponse.json({ error: 'Test not found or not available' }, { status: 404 });
    case 'TEST_HAS_NO_QUESTIONS':
      return NextResponse.json({ error: 'This test has no questions yet' }, { status: 400 });
    case 'ATTEMPT_LIMIT_REACHED':
      return NextResponse.json(
        { error: 'You have used all your attempts at this test.', code: 'ATTEMPT_LIMIT_REACHED' },
        { status: 403 },
      );
    case 'ATTEMPT_NOT_FOUND':
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    case 'ATTEMPT_NOT_OPEN':
    case 'ATTEMPT_ALREADY_SUBMITTED':
      return NextResponse.json(
        { error: 'This attempt is already finished. Start a new one to try again.', code: 'ATTEMPT_CLOSED' },
        { status: 409 },
      );
    case 'PLACEMENT_TEST_MISMATCH':
      return NextResponse.json({ error: 'That test does not belong here' }, { status: 400 });
    default:
      return null;
  }
}

async function resolveUser(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
  return user as { id: string } | null;
}

/**
 * GET /api/tests/attempt?test_id={id}&placement_id={id}
 * Start or resume an attempt. Returns the test, its questions and the attempt.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await resolveUser(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const testId = request.nextUrl.searchParams.get('test_id');
    const placementId = request.nextUrl.searchParams.get('placement_id');
    if (!testId) return NextResponse.json({ error: 'Missing test_id' }, { status: 400 });

    const test = await getTestMeta(testId);
    if (!test || !test.is_active || !test.is_published) {
      return NextResponse.json({ error: 'Test not found or not available' }, { status: 404 });
    }

    // Gated kinds are refused outright. A catch-up test is composed published
    // and with a classroom, so it used to be openable here, which skipped its
    // unlock check entirely. They have their own routes that re-derive the gate.
    const testKind = (test as any).test_kind as string | undefined;
    if (testKind === 'class_prep' || testKind === 'catchup_class') {
      return NextResponse.json(
        { error: 'Open this test from the class it belongs to.', code: 'WRONG_ENGINE' },
        { status: 403 },
      );
    }

    const now = new Date();
    if (test.available_from && new Date(test.available_from) > now) {
      return NextResponse.json({ error: 'Test is not yet available' }, { status: 403 });
    }
    if (test.available_until && new Date(test.available_until) < now) {
      return NextResponse.json({ error: 'Test has expired' }, { status: 403 });
    }

    // A placement carries its own window and visibility on top of the test's.
    if (placementId) {
      const placement = await getPlacementById(placementId);
      if (placement && placement.test_id === testId) {
        if (!placement.is_active || !placement.is_visible) {
          return NextResponse.json({ error: 'This test is not available' }, { status: 403 });
        }
        if (placement.available_from && new Date(placement.available_from) > now) {
          return NextResponse.json({ error: 'This test is not open yet' }, { status: 403 });
        }
        if (placement.available_until && new Date(placement.available_until) < now) {
          return NextResponse.json({ error: 'This test has closed' }, { status: 403 });
        }
      }
    }

    const started = await startOrResumeAttempt({ testId, studentId: user.id, placementId });
    const composed = await getComposedTestQuestions(testId, false);

    // Shape kept as the take page already expects it.
    let questions = composed.map((q) => ({
      id: q.test_question_id,
      sort_order: q.sort_order,
      marks: q.marks,
      negative_marks: 0,
      qb_question_id: q.question_id,
      question_id: q.question_id,
      question: {
        id: q.question_id,
        question_text: q.question_text,
        question_image_url: q.question_image_url,
        question_type: q.question_format,
        options: q.options,
      },
    }));
    if (test.shuffle_questions) {
      questions = [...questions].sort(() => Math.random() - 0.5);
    }

    return NextResponse.json({
      test: {
        id: test.id,
        title: test.title,
        description: test.description,
        test_type: test.test_type,
        duration_minutes: test.duration_minutes,
        per_question_seconds: test.per_question_seconds,
        total_marks: test.total_marks,
      },
      questions,
      attempt: started.attempt,
      // Surfaced so the take page can say "Attempt 3" and show a best score to
      // beat, which is what makes an unlimited retake feel like progress.
      attempt_number: started.attempt.attempt_number,
      previous_attempts: started.previous_attempts,
      best_percentage: started.best_percentage,
      resumed: started.resumed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load test';
    const known = attemptError(message);
    if (known) return known;
    console.error('Test attempt GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/tests/attempt
 * Body: { attempt_id, answers, action: 'save' | 'submit' }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { attempt_id, answers, action } = body || {};
    if (!attempt_id) return NextResponse.json({ error: 'Missing attempt_id' }, { status: 400 });

    if (action === 'submit') {
      const result = await submitAttempt({
        attemptId: attempt_id,
        studentId: user.id,
        answers: answers || undefined,
      });

      // Enrich the review with the stem and the explanation. Seeing WHY an
      // answer was wrong is the entire reason to sit a practice test, and the
      // take flow deliberately does not carry explanations until this moment.
      const withAnswers = await getComposedTestQuestions(result.test_id, true).catch(() => []);
      const byId = new Map(withAnswers.map((q) => [q.question_id, q]));

      return NextResponse.json({
        action: 'submitted',
        result: {
          ...result,
          review: result.review.map((r) => {
            const q = byId.get(r.question_id);
            return {
              ...r,
              question_text: q?.question_text ?? null,
              options: q?.options ?? null,
              explanation: q?.explanation_brief ?? null,
              // Present only once someone has asked for the deeper version.
              // The take page uses this to decide between showing it and
              // offering the "explain in more detail" button.
              explanation_detailed: q?.explanation_detailed ?? null,
            };
          }),
        },
        attempt: {
          id: result.attempt_id,
          attempt_number: result.attempt_number,
          score: result.score,
          total_marks: result.total_marks,
          percentage: result.percentage,
          status: 'submitted',
        },
      });
    }

    await saveAttemptAnswers(attempt_id, user.id, answers || {});
    return NextResponse.json({ action: 'saved' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save attempt';
    const known = attemptError(message);
    if (known) return known;
    console.error('Test attempt POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
