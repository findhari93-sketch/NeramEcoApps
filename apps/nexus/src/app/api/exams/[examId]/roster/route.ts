import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listExamMakeups,
  getExamPlacement,
  getExamAttemptOverrides,
  getViolationCountsForTest,
} from '@neram/database';
import { requireExamStaff, loadExamRoster } from '@/lib/exam-access';
import {
  buildExamRoster,
  summariseExamRoster,
  sortExamRoster,
  type ExamRosterMakeup,
} from '@/lib/scheduled-exam-roster';

/**
 * Who is sitting the exam right now.
 *
 * Polled while the window is live, so it is deliberately no-store and
 * deliberately NOT a force-dynamic page: one small route the panel asks every
 * 20 seconds is far cheaper than a page that opts the whole route tree out of
 * caching.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const exam = access.exam;
    const supabase = getSupabaseAdminClient();

    const [students, makeupRows, placement] = await Promise.all([
      loadExamRoster(exam.classroom_id),
      listExamMakeups(params.examId),
      getExamPlacement(params.examId),
    ]);

    const studentIds = students.map((s) => s.id);
    const [{ data: attempts }, attemptOverrides, violationCounts] = await Promise.all([
      supabase
        .from('nexus_test_attempts' as any)
        .select(
          'student_id, status, started_at, submitted_at, score, percentage, final_percentage, finalised_at',
        )
        .eq('test_id', exam.test_id)
        .eq('mode', 'official')
        .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']),
      getExamAttemptOverrides(params.examId),
      getViolationCountsForTest(exam.test_id, studentIds),
    ]);

    const makeups = new Map<string, ExamRosterMakeup>(
      makeupRows.map((m) => [
        m.student_id,
        { opens_at: m.opens_at, closes_at: m.closes_at, revoked_at: m.revoked_at },
      ]),
    );

    const placementRow = placement as { gating?: Record<string, unknown> } | null;
    const baseAttemptLimit = Number(placementRow?.gating?.attempt_limit);

    const rows = sortExamRoster(
      buildExamRoster({
        students,
        attempts: (attempts || []) as any[],
        makeups,
        window: { opens_at: exam.opens_at, closes_at: exam.closes_at },
        durationMinutes: exam.duration_minutes,
        now: Date.now(),
        baseAttemptLimit: Number.isFinite(baseAttemptLimit) ? baseAttemptLimit : null,
        attemptOverrides,
        violationCounts,
      }),
    );

    const now = Date.now();
    return NextResponse.json(
      {
        data: {
          exam,
          rows,
          summary: summariseExamRoster(rows),
          // The client stops polling on this rather than on a clock it keeps
          // itself, so a laptop with a wrong time does not poll forever.
          is_live: now >= new Date(exam.opens_at).getTime() && now <= new Date(exam.closes_at).getTime(),
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Roster API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
