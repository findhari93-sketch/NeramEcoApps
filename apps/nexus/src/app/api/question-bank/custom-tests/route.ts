import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/question-bank/custom-tests
 * Student creates a custom test from QB questions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, question_ids, timer_type, duration_minutes, per_question_seconds, classroom_id } = body;

    // Verify QB access
    const access = await verifyQBAccess(
      request.headers.get('Authorization'),
      classroom_id,
    );
    if (!access.ok) return access.response;

    const { caller } = access;

    // Validate question_ids
    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      return NextResponse.json(
        { error: 'question_ids must be a non-empty array' },
        { status: 400 },
      );
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 },
      );
    }

    // Determine test_type from timer_type
    let test_type: string;
    switch (timer_type) {
      case 'full':
        test_type = 'timed';
        break;
      case 'per_question':
        test_type = 'per_question_timer';
        break;
      case 'none':
      default:
        test_type = 'untimed';
        break;
    }

    const supabase = getSupabaseAdminClient();

    // Verify all question_ids exist in nexus_qb_questions
    const { data: existingQuestions, error: qErr } = await supabase
      .from('nexus_qb_questions')
      .select('id')
      .in('id', question_ids)
      .eq('is_active', true);

    if (qErr) throw qErr;

    const validIds = new Set((existingQuestions || []).map((q: { id: string }) => q.id));
    const invalidIds = question_ids.filter((id: string) => !validIds.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Some question IDs are invalid or inactive: ${invalidIds.join(', ')}` },
        { status: 400 },
      );
    }

    // Create nexus_tests row
    const { data: test, error: testErr } = await (supabase as any)
      .from('nexus_tests')
      .insert({
        classroom_id,
        title: title.trim(),
        test_type,
        duration_minutes: timer_type === 'full' ? (duration_minutes || null) : null,
        per_question_seconds: timer_type === 'per_question' ? (per_question_seconds || null) : null,
        total_marks: question_ids.length, // 1 mark each
        is_published: true, // immediately available to the student
        is_custom: true,
        created_by_student: caller.id,
        created_by: caller.id,
        is_active: true,
      })
      .select('id, title')
      .single();

    if (testErr) throw testErr;

    // Create nexus_test_questions rows using qb_question_id
    const testQuestions = question_ids.map((qId: string, idx: number) => ({
      test_id: test.id,
      qb_question_id: qId,
      sort_order: idx,
      marks: 1,
      negative_marks: 0,
    }));

    const { error: tqErr } = await (supabase as any)
      .from('nexus_test_questions')
      .insert(testQuestions);

    if (tqErr) throw tqErr;

    return NextResponse.json(
      {
        data: {
          test_id: test.id,
          title: test.title,
          question_count: question_ids.length,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create custom test';
    console.error('Custom test POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
