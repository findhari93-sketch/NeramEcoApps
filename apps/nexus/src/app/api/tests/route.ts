import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, loadClassPrepStates } from '@neram/database';

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
      // Students see published non-custom tests + their own custom tests.
      //
      // GATED KINDS ARE EXCLUDED, and this is a fix, not a precaution. Every
      // catch-up class test is composed with a classroom_id, is_published and
      // is_repository, and carries no classroom_assignment placement, so it used
      // to arrive here, fall through to the "no assignment" branch on the student
      // page, and render as "Assigned by your teacher" for the whole classroom.
      // A student could then open it through /api/tests/attempt, which only
      // validates a placement when the client supplies one, and so never checked
      // test_unlocked_at at all. A gated test must be reachable ONLY through its
      // own route, which re-derives the gate server side.
      const { data: publishedTests, error: pubErr } = await supabase
        .from('nexus_tests')
        .select('*, questions:nexus_test_questions(count)')
        .eq('classroom_id', classroomId)
        .eq('is_published', true)
        .eq('is_active', true)
        .or('is_custom.is.null,is_custom.eq.false')
        .not('test_kind', 'in', '("class_prep","catchup_class")')
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

      // Class prep tests, returned SEPARATELY and never merged into `tests`.
      //
      // Excluding them from the list above was necessary (a gated test opened
      // through the legacy engine skips its own gate), but on its own it left the
      // student with no way to find out a test exists before Wednesday's class
      // except by opening that class. So they come back as their own list,
      // carrying the class they belong to, and the page links to the class prep
      // route rather than the generic take page.
      const { data: prepPlacements } = await (supabase as any)
        .from('nexus_test_placements')
        .select('id, context_id, passing_pct, test_id')
        .eq('context_type', 'class_prep_test')
        .eq('is_active', true);

      let classPrep: unknown[] = [];
      const prepClassIds = (prepPlacements || []).map((p: any) => p.context_id);
      if (prepClassIds.length > 0) {
        // Scoped to THIS classroom and to classes that have not finished. A prep
        // test for a class that already ran is not pre-class work anymore.
        const todayIst = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
        const [{ data: prepClasses }, { data: prepTests }] = await Promise.all([
          supabase
            .from('nexus_scheduled_classes')
            .select('id, title, scheduled_date, start_time, status')
            .in('id', prepClassIds)
            .eq('classroom_id', classroomId)
            .gte('scheduled_date', todayIst)
            .in('status', ['scheduled', 'live']),
          (supabase as any)
            .from('nexus_tests')
            .select('id, title, total_marks, questions:nexus_test_questions(count)')
            .in(
              'id',
              (prepPlacements || []).map((p: any) => p.test_id),
            ),
        ]);

        // Typed as any: nexus_test_placements and nexus_tests.test_kind are not in
        // database.generated.ts yet, so the inferred row type is {}.
        const testById = new Map<string, any>((prepTests || []).map((t: any) => [t.id, t]));
        const placementByClass = new Map<string, any>(
          (prepPlacements || []).map((p: any) => [p.context_id, p]),
        );

        const prepStateRows = await loadClassPrepStates(
          user.id,
          (prepClasses || []).map((c: any) => c.id),
          supabase as any,
        );

        classPrep = (prepClasses || [])
          .map((cls: any) => {
            const placement = placementByClass.get(cls.id);
            const t = placement ? testById.get(placement.test_id) : null;
            if (!t) return null;
            const state = prepStateRows.get(cls.id);
            const questionCount = t.questions?.[0]?.count ?? 0;
            return {
              class_id: cls.id,
              class_title: cls.title,
              scheduled_date: cls.scheduled_date,
              start_time: cls.start_time,
              test_id: t.id,
              title: t.title,
              question_count: questionCount,
              passing_pct: placement.passing_pct ?? 70,
              must_get_right: Math.ceil(((placement.passing_pct ?? 70) / 100) * questionCount),
              best_pct: state?.test_best_pct ?? null,
              attempts: state?.test_attempts ?? 0,
              passed: !!state?.test_passed_at,
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) =>
            `${a.scheduled_date}${a.start_time}`.localeCompare(`${b.scheduled_date}${b.start_time}`),
          );
      }

      return NextResponse.json({ tests: testsWithAttempts, classPrep, role: 'student' });
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
