import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { fetchAllRows, getSupabaseAdminClient } from '@neram/database';
import { collectTestIssues, hasBlockingIssue } from '@/lib/test-health';

/**
 * GET /api/question-bank/tests/[id]/health   (staff)
 *
 * Everything that suggests this paper is broken, from the three streams that
 * fail differently: what students reported about its questions, what the app
 * observed going wrong inside it, and what is malformed on its face.
 *
 * A SEPARATE route from the test detail read, deliberately. The detail page is
 * on the critical path for every teacher opening any test; this is three extra
 * queries in service of a panel most papers will render empty. Loading it
 * alongside would tax the common case to serve the rare one.
 *
 * Soft-fails each stream independently. The tables behind two of them are new,
 * and on an environment where the migrations have not landed the structural
 * checks alone are still worth showing.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can see test health' }, { status: 403 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const testId = params.id;

    const { data: test, error: testErr } = await supabase
      .from('nexus_tests')
      .select('id, title')
      .eq('id', testId)
      .maybeSingle();
    if (testErr) throw testErr;
    if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    // Paged: a 544-question paper is a real thing in this table, and a one-shot
    // read would be silently capped at PostgREST's 1000-row ceiling.
    const links = await fetchAllRows<any>(() =>
      supabase
        .from('nexus_test_questions')
        .select(
          'qb_question_id, question:nexus_qb_questions(id, is_active, correct_answer, question_text, question_image_url, question_format, options)',
        )
        .eq('test_id', testId),
    );

    const questions = links
      .map((l) => l.question)
      .filter(Boolean)
      .map((q: any) => ({
        id: q.id,
        is_active: q.is_active,
        correct_answer: q.correct_answer,
        question_text: q.question_text,
        question_image_url: q.question_image_url,
        question_format: q.question_format,
        options: q.options,
      }));

    // A link row whose question embed did not resolve means the question was
    // hard-deleted from the bank. Counted so the paper is not silently reported
    // as smaller and healthier than it is.
    const orphaned = links.length - questions.length;

    const questionIds = questions.map((q) => q.id);

    const [errors, reports] = await Promise.all([
      fetchAllRows<any>(() =>
        supabase.from('nexus_test_attempt_errors').select('phase, question_id').eq('test_id', testId),
      ).catch(() => [] as any[]),
      questionIds.length > 0
        ? fetchAllRows<any>(() =>
            supabase
              .from('nexus_qb_question_reports')
              .select('id, question_id, report_type, description, status, created_at')
              .in('question_id', questionIds)
              .in('status', ['open', 'in_review']),
          ).catch(() => [] as any[])
        : Promise.resolve([] as any[]),
    ]);

    const issues = collectTestIssues({
      structural: { question_count: links.length, questions, title: test.title },
      errors,
      reports,
    });

    if (orphaned > 0) {
      issues.unshift({
        stream: 'structural',
        severity: 'error',
        title: `${orphaned} question${orphaned === 1 ? '' : 's'} in this paper no longer exist in the question bank`,
        count: orphaned,
      });
    }

    return NextResponse.json({
      data: {
        issues,
        blocking: hasBlockingIssue(issues),
        // The raw reports travel too, because "3 unresolved reports" is a
        // summary and a teacher fixing them needs the actual complaints.
        reports: reports.map((r: any) => ({
          id: r.id,
          question_id: r.question_id,
          report_type: r.report_type,
          description: r.description,
          created_at: r.created_at,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check this test';
    console.error('Test health error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
