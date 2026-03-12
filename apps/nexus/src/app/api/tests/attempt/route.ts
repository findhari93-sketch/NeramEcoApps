import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/tests/attempt?test_id={id}
 * Start or resume a test attempt. Returns test + questions.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const testId = request.nextUrl.searchParams.get('test_id');

    if (!testId) {
      return NextResponse.json({ error: 'Missing test_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get test details
    const { data: test } = await supabase
      .from('nexus_tests')
      .select('*')
      .eq('id', testId)
      .eq('is_published', true)
      .eq('is_active', true)
      .single();

    if (!test) {
      return NextResponse.json({ error: 'Test not found or not available' }, { status: 404 });
    }

    // Check availability window
    const now = new Date();
    if (test.available_from && new Date(test.available_from) > now) {
      return NextResponse.json({ error: 'Test is not yet available' }, { status: 403 });
    }
    if (test.available_until && new Date(test.available_until) < now) {
      return NextResponse.json({ error: 'Test has expired' }, { status: 403 });
    }

    // Get questions with details (don't expose correct_answer during test)
    const { data: testQuestions } = await supabase
      .from('nexus_test_questions')
      .select('id, sort_order, marks, negative_marks, question:nexus_verified_questions(id, question_text, question_image_url, question_type, options)')
      .eq('test_id', testId)
      .order('sort_order', { ascending: true });

    // Check for existing in-progress attempt
    const { data: existingAttempt } = await supabase
      .from('nexus_test_attempts')
      .select('*')
      .eq('test_id', testId)
      .eq('student_id', user.id)
      .eq('status', 'in_progress')
      .single();

    let attempt = existingAttempt;

    if (!attempt) {
      // Check if already submitted
      const { data: submittedAttempt } = await supabase
        .from('nexus_test_attempts')
        .select('*')
        .eq('test_id', testId)
        .eq('student_id', user.id)
        .eq('status', 'submitted')
        .single();

      if (submittedAttempt) {
        return NextResponse.json({
          error: 'You have already submitted this test',
          attempt: submittedAttempt,
        }, { status: 409 });
      }

      // Create new attempt
      const { data: newAttempt, error } = await supabase
        .from('nexus_test_attempts')
        .insert({
          test_id: testId,
          student_id: user.id,
          status: 'in_progress',
          answers: {},
        })
        .select()
        .single();

      if (error) throw error;
      attempt = newAttempt;
    }

    // Shuffle questions if needed
    let questions = testQuestions || [];
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
      attempt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load test';
    console.error('Test attempt GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/tests/attempt
 * Save answers (auto-save) or submit the test
 * Body: { attempt_id, answers, action: 'save' | 'submit' }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { attempt_id, answers, action } = body;

    if (!attempt_id) {
      return NextResponse.json({ error: 'Missing attempt_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify ownership
    const { data: attempt } = await supabase
      .from('nexus_test_attempts')
      .select('*, test:nexus_tests(*)')
      .eq('id', attempt_id)
      .eq('student_id', user.id)
      .single();

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    if (attempt.status !== 'in_progress') {
      return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
    }

    if (action === 'submit') {
      // Calculate score
      const test = attempt.test as any;
      const { data: testQuestions } = await supabase
        .from('nexus_test_questions')
        .select('question_id, marks, negative_marks, question:nexus_verified_questions(correct_answer)')
        .eq('test_id', attempt.test_id);

      let score = 0;
      let totalMarks = 0;
      const answersObj = answers || attempt.answers || {};

      for (const tq of testQuestions || []) {
        const qMarks = Number(tq.marks) || 1;
        const negMarks = Number(tq.negative_marks) || 0;
        totalMarks += qMarks;
        const correctAnswer = (tq.question as any)?.correct_answer;
        const studentAnswer = answersObj[tq.question_id];

        if (studentAnswer && correctAnswer) {
          if (studentAnswer === correctAnswer) {
            score += qMarks;
          } else if (negMarks > 0) {
            score -= negMarks;
          }
        }
      }

      const startedAt = new Date(attempt.started_at || Date.now());
      const timeSpent = Math.round((Date.now() - startedAt.getTime()) / 1000);
      const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

      const { data: updated, error } = await supabase
        .from('nexus_test_attempts')
        .update({
          answers: answersObj,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          time_spent_seconds: timeSpent,
          score,
          total_marks: totalMarks,
          percentage: Math.max(0, percentage),
        })
        .eq('id', attempt_id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ attempt: updated, action: 'submitted' });
    } else {
      // Auto-save answers
      const { error } = await supabase
        .from('nexus_test_attempts')
        .update({ answers: answers || {} })
        .eq('id', attempt_id);

      if (error) throw error;
      return NextResponse.json({ action: 'saved' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save attempt';
    console.error('Test attempt POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
