import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { fetchAllRows, getSupabaseAdminClient } from '@neram/database';
import {
  affectedStudentsByPhase,
  attemptIdsToLookUp,
  collectTestIssues,
  hasBlockingIssue,
  realFailures,
  type AttemptErrorRow,
} from '@/lib/test-health';
import { readLatestHealthClear } from '@/lib/test-health-clears';

/** Keeps each `.in()` filter well inside PostgREST's URL length limit. */
const IN_CHUNK = 100;

async function readInChunks<T>(ids: string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(...(await read(ids.slice(i, i + IN_CHUNK))));
  return out;
}

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
 * THE APP STREAM COUNTS STUDENTS, NOT ROWS. On acf8084d (2026-09-17) the banner
 * said 21 students could not submit and 12 could not open the paper. Four could
 * not submit; everything else was the door refusing on purpose, students tapping
 * twice, and a teacher's preview. So the rows are cut, in order, to:
 *   after the latest "Mark as fixed" (nexus_test_health_clears)
 *   not an expected refusal (lib/test-error-classify.ts)
 *   not staff
 * and then counted by distinct student.
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
    const [links, cleared] = await Promise.all([
      fetchAllRows<any>(() =>
        supabase
          .from('nexus_test_questions')
          .select(
            'qb_question_id, question:nexus_qb_questions(id, is_active, correct_answer, question_text, question_image_url, question_format, options)',
          )
          .eq('test_id', testId),
      ),
      // Never throws: a missing table reads as "never cleared".
      readLatestHealthClear(supabase, testId),
    ]);

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

    const [rawErrors, reports] = await Promise.all([
      fetchAllRows<AttemptErrorRow>(() => {
        let query = supabase
          .from('nexus_test_attempt_errors')
          .select('id, phase, question_id, student_id, attempt_id, message, detail, created_at')
          .eq('test_id', testId);
        if (cleared) query = query.gt('created_at', cleared.cleared_at);
        // Ordered so paging is stable.
        return query.order('created_at', { ascending: true }).order('id', { ascending: true });
      }).catch(() => [] as AttemptErrorRow[]),
      questionIds.length > 0
        ? fetchAllRows<any>(() =>
            supabase
              .from('nexus_qb_question_reports')
              .select('id, question_id, report_type, target, description, status, created_at')
              .in('question_id', questionIds)
              .in('status', ['open', 'in_review']),
          ).catch(() => [] as any[])
        : Promise.resolve([] as any[]),
    ]);

    // Whether each closed-attempt submit was in fact submitted, and who is staff.
    // Both soft-fail: without them the rows are simply counted as failures,
    // which over-reports rather than hiding something real.
    const lookUpIds = attemptIdsToLookUp(rawErrors);
    const studentIds = [...new Set(rawErrors.map((r) => r.student_id).filter((id): id is string => Boolean(id)))];

    const [attemptRows, userRows] = await Promise.all([
      readInChunks<any>(lookUpIds, async (chunk) => {
        const { data, error } = await supabase.from('nexus_test_attempts').select('id, status').in('id', chunk);
        if (error) throw error;
        return data || [];
      }).catch(() => [] as any[]),
      readInChunks<any>(studentIds, async (chunk) => {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, avatar_url, user_type, staff_role, can_teach')
          .in('id', chunk);
        if (error) throw error;
        return data || [];
      }).catch(() => [] as any[]),
    ]);

    const usersById = new Map<string, any>(userRows.map((u: any) => [u.id, u]));
    const staffIds = new Set<string>(userRows.filter((u: any) => resolveStaffRole(u) !== null).map((u: any) => u.id));
    const attemptStatusById = new Map<string, string>(attemptRows.map((a: any) => [a.id, String(a.status)]));

    const errors = realFailures(rawErrors, {
      staffIds,
      attemptStatusById,
      clearedAt: cleared?.cleared_at ?? null,
    });

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

    // Who each app problem happened to, with what the panel needs to show a
    // face beside the name.
    const affected = Object.fromEntries(
      Object.entries(affectedStudentsByPhase(errors)).map(([phase, students]) => [
        phase,
        students.map((s) => ({
          ...s,
          name: usersById.get(s.student_id)?.name ?? null,
          avatar_url: usersById.get(s.student_id)?.avatar_url ?? null,
        })),
      ]),
    );

    return NextResponse.json({
      data: {
        issues,
        blocking: hasBlockingIssue(issues),
        affected,
        // When this paper was last marked fixed, so the panel can say so.
        cleared: cleared ? { cleared_at: cleared.cleared_at, cleared_by: cleared.cleared_by } : null,
        // The raw reports travel too, because "3 unresolved reports" is a
        // summary and a teacher fixing them needs the actual complaints.
        reports: reports.map((r: any) => ({
          id: r.id,
          question_id: r.question_id,
          report_type: r.report_type,
          target: r.target ?? null,
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
