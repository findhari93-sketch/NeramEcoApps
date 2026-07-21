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

    // When opened through a placement (assigned/practice), enforce that
    // placement's own window and visibility too.
    const placementId = request.nextUrl.searchParams.get('placement_id');
    if (placementId) {
      const { data: placement } = await (supabase as any)
        .from('nexus_test_placements')
        .select('id, test_id, is_active, is_visible, available_from, available_until')
        .eq('id', placementId)
        .maybeSingle();
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

    // Get questions with details (don't expose correct_answer during test).
    // Resolved per ROW, not per test: composed tests reference the bank via
    // qb_question_id while legacy rows use question_id -> nexus_verified_questions.
    // (Branching on is_custom broke teacher-built repository tests, which are
    // not custom but are composed entirely of bank questions.)
    const { data: tqRows } = await (supabase as any)
      .from('nexus_test_questions')
      .select('id, sort_order, marks, negative_marks, qb_question_id, question_id')
      .eq('test_id', testId)
      .order('sort_order', { ascending: true });
    const rows = tqRows || [];
    const qbIds = rows.filter((r: any) => r.qb_question_id).map((r: any) => r.qb_question_id);
    const vIds = rows.filter((r: any) => !r.qb_question_id && r.question_id).map((r: any) => r.question_id);

    const qbMap = new Map<string, any>();
    if (qbIds.length > 0) {
      const { data } = await (supabase as any)
        .from('nexus_qb_questions')
        .select('id, question_text, question_image_url, question_format, options')
        .in('id', qbIds);
      for (const q of data || []) qbMap.set(q.id, q);
    }
    const vMap = new Map<string, any>();
    if (vIds.length > 0) {
      const { data } = await supabase
        .from('nexus_verified_questions')
        .select('id, question_text, question_image_url, question_type, options')
        .in('id', vIds);
      for (const q of data || []) vMap.set(q.id, q);
    }

    const testQuestions: any[] = rows.map((tq: any) => {
      const src = tq.qb_question_id ? qbMap.get(tq.qb_question_id) : vMap.get(tq.question_id);
      return {
        id: tq.id,
        sort_order: tq.sort_order,
        marks: tq.marks,
        negative_marks: tq.negative_marks,
        qb_question_id: tq.qb_question_id || null,
        question_id: tq.question_id || null,
        question: src
          ? {
              id: src.id,
              question_text: src.question_text,
              question_image_url: src.question_image_url,
              question_type: src.question_format || src.question_type || 'mcq',
              options: src.options,
            }
          : null,
      };
    });

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

    // Check for existing in-progress attempt
    const { data: existingAttempt } = await supabase
      .from('nexus_test_attempts')
      .select('*')
      .eq('test_id', testId)
      .eq('student_id', user.id)
      .eq('status', 'in_progress')
      .single();

    let attempt = existingAttempt;

    // If there's an in_progress attempt, check if it's stale (expired)
    if (attempt) {
      let isStale = false;

      if (test.test_type === 'timed' && test.duration_minutes && attempt.started_at) {
        const startedAt = new Date(attempt.started_at).getTime();
        const durationMs = test.duration_minutes * 60 * 1000;
        const graceMs = 30 * 1000; // 30s grace for network delays
        if (Date.now() > startedAt + durationMs + graceMs) {
          isStale = true;
        }
      }

      if (test.test_type === 'per_question_timer' && test.per_question_seconds && attempt.started_at) {
        // For per-question timer: total allowed time = per_question_seconds * question_count
        const totalAllowed = test.per_question_seconds * testQuestions.length * 1000;
        const graceMs = 60 * 1000; // 1 min grace
        const startedAt = new Date(attempt.started_at).getTime();
        if (Date.now() > startedAt + totalAllowed + graceMs) {
          isStale = true;
        }
      }

      if (isStale) {
        // Auto-mark as abandoned (timer expired while user was away)
        await supabase
          .from('nexus_test_attempts')
          .update({
            status: 'abandoned',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', attempt.id);
        attempt = null; // Will create a new attempt below
      }
    }

    if (!attempt) {
      // Create new attempt (first time or after abandoned previous)
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
    let questions = testQuestions;
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
      // Calculate score. Same per-row dual resolution as the GET: a row grades
      // against the bank when it has qb_question_id, else the legacy verified table.
      const { data: tqRows } = await (supabase as any)
        .from('nexus_test_questions')
        .select('qb_question_id, question_id, marks, negative_marks')
        .eq('test_id', attempt.test_id);
      const rows = tqRows || [];
      const qbIds = rows.filter((r: any) => r.qb_question_id).map((r: any) => r.qb_question_id);
      const vIds = rows.filter((r: any) => !r.qb_question_id && r.question_id).map((r: any) => r.question_id);

      const qbMap = new Map<string, any>();
      if (qbIds.length > 0) {
        const { data } = await (supabase as any)
          .from('nexus_qb_questions')
          .select('id, correct_answer')
          .in('id', qbIds);
        for (const q of data || []) qbMap.set(q.id, q);
      }
      const vMap = new Map<string, any>();
      if (vIds.length > 0) {
        const { data } = await supabase
          .from('nexus_verified_questions')
          .select('id, correct_answer')
          .in('id', vIds);
        for (const q of data || []) vMap.set(q.id, q);
      }

      const testQuestions: any[] = rows.map((tq: any) => {
        const src = tq.qb_question_id ? qbMap.get(tq.qb_question_id) : vMap.get(tq.question_id);
        return {
          ...tq,
          question: src ? { id: src.id, correct_answer: src.correct_answer } : null,
        };
      });

      let score = 0;
      let totalMarks = 0;
      const answersObj = answers || attempt.answers || {};

      for (const tq of testQuestions || []) {
        const qMarks = Number(tq.marks) || 1;
        const negMarks = Number(tq.negative_marks) || 0;
        totalMarks += qMarks;
        const correctAnswer = (tq.question as any)?.correct_answer;
        // Use the question ID from the joined question object for answer lookup
        const questionId = (tq.question as any)?.id || tq.question_id || tq.qb_question_id;
        const studentAnswer = answersObj[questionId];

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
