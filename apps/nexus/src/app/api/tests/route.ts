import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/tests?classroom={id}
 * Students: list published tests with their attempt status
 * Teachers: list all tests
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
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

    // Check role
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('classroom_id', classroomId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    if (enrollment.role === 'teacher') {
      // Teachers see all tests with question count
      const { data: tests, error } = await supabase
        .from('nexus_tests')
        .select('*, questions:nexus_test_questions(count), attempts:nexus_test_attempts(count)')
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ tests: tests || [], role: 'teacher' });
    } else {
      // Students see published non-custom tests + their own custom tests
      const { data: publishedTests, error: pubErr } = await supabase
        .from('nexus_tests')
        .select('*, questions:nexus_test_questions(count)')
        .eq('classroom_id', classroomId)
        .eq('is_published', true)
        .eq('is_active', true)
        .or('is_custom.is.null,is_custom.eq.false')
        .order('created_at', { ascending: false });

      if (pubErr) throw pubErr;

      // Also fetch this student's custom tests
      const { data: customTests, error: custErr } = await supabase
        .from('nexus_tests')
        .select('*, questions:nexus_test_questions(count)')
        .eq('classroom_id', classroomId)
        .eq('is_custom', true)
        .eq('created_by_student', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (custErr) throw custErr;

      // Placement-sourced tests (unified engine): teacher assignments + the practice
      // pool for this classroom. Legacy tests key off nexus_tests.classroom_id, the
      // builder places via nexus_test_placements, so both sources must be merged.
      // nexus_test_placements is not in the generated types yet (see test-repository.ts).
      const { data: placements } = await (supabase as any)
        .from('nexus_test_placements')
        .select('id, test_id, context_type, passing_pct, available_from, available_until')
        .eq('context_id', classroomId)
        .in('context_type', ['classroom_assignment', 'student_practice'])
        .eq('is_active', true)
        .eq('is_visible', true)
        .order('created_at', { ascending: false });

      const placementByTest = new Map<string, any>();
      for (const p of placements || []) {
        const existing = placementByTest.get(p.test_id);
        // classroom_assignment (mandatory) wins if a test is placed as both.
        if (!existing || (existing.context_type === 'student_practice' && p.context_type === 'classroom_assignment')) {
          placementByTest.set(p.test_id, p);
        }
      }
      const placedIds = [...placementByTest.keys()];
      let placedTests: any[] = [];
      if (placedIds.length > 0) {
        const { data: placed } = await supabase
          .from('nexus_tests')
          .select('*, questions:nexus_test_questions(count)')
          .in('id', placedIds)
          .eq('is_published', true)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        placedTests = placed || [];
      }

      // Merge + dedupe by test id (placement info attaches either way).
      const byId = new Map<string, any>();
      for (const t of [...(customTests || []), ...(publishedTests || []), ...placedTests]) {
        if (!byId.has(t.id)) byId.set(t.id, t);
      }
      const tests = [...byId.values()].map((t: any) => {
        const p = placementByTest.get(t.id);
        return {
          ...t,
          question_count: Array.isArray(t.questions) ? t.questions[0]?.count ?? 0 : 0,
          assignment: p
            ? {
                placement_id: p.id,
                context_type: p.context_type,
                available_from: p.available_from,
                available_until: p.available_until,
                passing_pct: p.passing_pct,
              }
            : null,
        };
      });

      // Get student's attempts for these tests
      const testIds = tests.map((t: any) => t.id);
      const { data: attempts } = testIds.length > 0
        ? await supabase
            .from('nexus_test_attempts')
            .select('id, test_id, status, score, total_marks, percentage, started_at, submitted_at')
            .eq('student_id', user.id)
            .in('test_id', testIds)
        : { data: [] };

      const testsWithAttempts = tests.map((test: any) => ({
        ...test,
        myAttempt: (attempts || []).find((a: any) => a.test_id === test.id) || null,
      }));

      return NextResponse.json({ tests: testsWithAttempts, role: 'student' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tests';
    console.error('Tests GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/tests
 * Teacher creates a new test
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: test, error } = await supabase
      .from('nexus_tests')
      .insert({
        classroom_id: body.classroom_id,
        title: body.title,
        description: body.description || null,
        test_type: body.test_type || 'timed',
        duration_minutes: body.duration_minutes || null,
        per_question_seconds: body.per_question_seconds || null,
        total_marks: body.total_marks || null,
        passing_marks: body.passing_marks || null,
        shuffle_questions: body.shuffle_questions || false,
        show_answers_after: body.show_answers_after !== false,
        available_from: body.available_from || null,
        available_until: body.available_until || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // If questions provided, add them
    if (body.question_ids && body.question_ids.length > 0) {
      const testQuestions = body.question_ids.map((qId: string, i: number) => ({
        test_id: test.id,
        question_id: qId,
        sort_order: i,
        marks: body.marks_per_question || 1,
        negative_marks: body.negative_marks || 0,
      }));

      await supabase.from('nexus_test_questions').insert(testQuestions);
    }

    return NextResponse.json({ test }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create test';
    console.error('Tests POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/tests
 * Update test (publish/unpublish, edit settings)
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { test_id, ...updates } = body;

    if (!test_id) {
      return NextResponse.json({ error: 'Missing test_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: test, error } = await supabase
      .from('nexus_tests')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', test_id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ test });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update test';
    console.error('Tests PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
