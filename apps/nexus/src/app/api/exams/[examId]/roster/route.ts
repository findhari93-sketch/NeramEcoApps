import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listExamMakeups,
  getExamPlacement,
  getExamAttemptOverrides,
  getViolationCountsForTest,
  loadExamEligibilityFacts,
  getTestMeta,
  resolveExamTimer,
  loadRunSittings,
} from '@neram/database';
import { requireExamStaff, loadExamRoster, keepSittingOrTracked } from '@/lib/exam-access';
import {
  buildExamRoster,
  summariseExamRoster,
  sortExamRoster,
  type ExamRosterMakeup,
} from '@/lib/scheduled-exam-roster';
import { buildExamEligibilityRoster } from '@/lib/exam-eligibility-roster';

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

    const [everyone, makeupRows, placement, eligibilityFacts, testMeta] = await Promise.all([
      loadExamRoster(exam.classroom_id),
      listExamMakeups(params.examId),
      getExamPlacement(params.examId),
      loadExamEligibilityFacts(params.examId, exam.classroom_id),
      getTestMeta(exam.test_id),
    ]);

    const excused = new Map<string, boolean>(
      buildExamEligibilityRoster(eligibilityFacts).map((row) => [row.student_id, !row.is_mandatory]),
    );

    const everyoneIds = everyone.map((s) => s.id);
    const [attempts, attemptOverrides, violationCounts] = await Promise.all([
      loadRosterAttempts(exam, placement as any, everyoneIds, supabase),
      getExamAttemptOverrides(params.examId),
      getViolationCountsForTest(exam.test_id, everyoneIds),
    ]);

    // Paused students leave the roster unless they really sat it (founder rule).
    const satIds = new Set<string>(((attempts || []) as any[]).map((a) => a.student_id as string));
    const students = keepSittingOrTracked(everyone, satIds);
    const pausedIds = new Set(students.filter((s) => s.dormant).map((s) => s.id));
    const pausedHidden = everyone.filter((s) => s.dormant).length - pausedIds.size;

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
        // The paper can be Untimed while the exam's raw duration_minutes still
        // carries a stale/inert number -- resolve through the same rule the
        // student's own countdown uses, or the roster and the student screen
        // can disagree about whether this sitting is timed at all.
        durationMinutes: resolveExamTimer(exam, testMeta ?? {}).duration_minutes,
        now: Date.now(),
        baseAttemptLimit: Number.isFinite(baseAttemptLimit) ? baseAttemptLimit : null,
        attemptOverrides,
        violationCounts,
        excused,
      }).map((row) => (pausedIds.has(row.student_id) ? { ...row, paused: true } : row)),
    );

    const now = Date.now();
    return NextResponse.json(
      {
        data: {
          exam,
          rows,
          summary: summariseExamRoster(rows),
          paused_hidden: pausedHidden,
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

const ROSTER_ATTEMPT_COLUMNS =
  'student_id, status, started_at, submitted_at, score, percentage, final_percentage, finalised_at';

/**
 * The attempts that are each student's exam, by the rule every other screen
 * uses (run-sittings.ts in @neram/database).
 *
 * Any attempt on the paper used to count here, so a student practising the
 * chapter in Study Materials during the exam showed as sitting it, and one who
 * practised last week showed as done. A sitting through another door, or a
 * teacher's count, is ONE attempt: the exam is sat once, and passing every
 * practice try through would mark the row as out of attempts.
 */
async function loadRosterAttempts(
  exam: { test_id: string },
  placement: { id: string; available_from?: string | null; available_until?: string | null } | null,
  studentIds: string[],
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): Promise<any[]> {
  if (studentIds.length === 0) return [];

  if (placement?.id) {
    const byRun = await loadRunSittings<any>(
      [
        {
          id: placement.id,
          test_id: exam.test_id,
          available_from: placement.available_from ?? null,
          available_until: placement.available_until ?? null,
        },
      ],
      { studentIds, columns: ROSTER_ATTEMPT_COLUMNS },
      supabase,
    );
    const out: any[] = [];
    byRun.get(placement.id)?.forEach((sitting) => {
      if (sitting.source === 'run') out.push(...sitting.attempts);
      else if (sitting.first) out.push(sitting.first);
    });
    return out;
  }

  // No placement to anchor a window to. The paper wide reading, unchanged.
  const { data } = await supabase
    .from('nexus_test_attempts' as any)
    .select(ROSTER_ATTEMPT_COLUMNS)
    .eq('test_id', exam.test_id)
    .eq('mode', 'official')
    .in('student_id', studentIds);
  return (data || []) as any[];
}
