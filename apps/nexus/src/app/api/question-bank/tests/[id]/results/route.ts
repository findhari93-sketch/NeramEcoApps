import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import {
  getQuestionAnalysis,
  getSupabaseAdminClient,
  getTestResults,
  listPlacementsForTest,
  listRunCoveredClasses,
  loadAccessRequestsForRun,
  loadEligibilityFactsForPreview,
  loadRunEligibilityOverrides,
  resolvePlacementLabels,
  type NexusTestResultsOptions,
} from '@neram/database';
import { buildExamEligibilityRoster } from '@/lib/exam-eligibility-roster';
import {
  CLASSROOM_ANCHORED_CONTEXTS,
  CLASS_ANCHORED_CONTEXTS,
  buildRunLabel,
  canBuildRoster,
  classifyRunDoor,
} from '@/lib/test-run-scope';

/**
 * GET /api/question-bank/tests/[id]/results            (staff)
 * GET /api/question-bank/tests/[id]/results?placement_id=<uuid>
 *
 * Who sat the test and how they did, plus the per-question breakdown.
 *
 * Two shapes. Without placement_id this is the paper wide view it has always
 * been: everyone who ever sat this paper, through any door. With one it becomes
 * a report on a single RUN, and the students who never sat it are the whole
 * point of it, because "who has not done it" was the question the results tab
 * could not answer at all.
 *
 * The eligibility engine that decides who owed the paper is a pure module in
 * this app (lib/exam-eligibility-roster.ts) while its batched I/O lives in the
 * database package. Neither can import the other, so this route is where they
 * meet. That keeps one set of bucket rules for exams and class tests instead of
 * a second copy growing inside the package.
 *
 * Deliberately not polled and deliberately not force-dynamic. This is a report,
 * not an invigilation screen, and the 20s refresh the live exam roster needs
 * would cost invocations for data that does not move minute to minute.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can see test results' }, { status: 403 });
    }

    const supabase = getSupabaseAdminClient();
    const placementId = request.nextUrl.searchParams.get('placement_id');

    const placements = await listPlacementsForTest(params.id, supabase);
    const selected = placementId
      ? placements.find((p: any) => p.id === placementId) || null
      : null;

    if (placementId && !selected) {
      // Either it belongs to another paper or it has been detached. Saying so
      // beats silently falling back to the paper wide numbers under a heading
      // that claims to be one class.
      return NextResponse.json({ error: 'That run is not on this paper' }, { status: 404 });
    }

    const opts = selected ? await buildRunOptions(selected, supabase) : undefined;

    const [results, questions, runs, elsewhere] = await Promise.all([
      getTestResults(params.id, opts, supabase),
      getQuestionAnalysis(params.id, { placementId }, supabase),
      buildRuns(params.id, placements, supabase),
      selected
        ? loadElsewhereAttempts(params.id, (selected as any).id, supabase)
        : Promise.resolve({} as ElsewhereByStudent),
    ]);

    const rows = results.rows.map((r: any) => ({ ...r, elsewhere: elsewhere[r.student_id] ?? null }));

    return NextResponse.json(
      {
        data: {
          rows,
          stats: results.stats,
          questions,
          runs,
          run: selected
            ? {
                placement_id: (selected as any).id,
                door: classifyRunDoor((selected as any).context_type),
                context_type: (selected as any).context_type,
                closes_at: (selected as any).available_until ?? null,
                passing_pct: (selected as any).passing_pct ?? null,
              }
            : null,
        },
      },
      { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load results';
    console.error('Test results error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Turn one placement into the roster and window that scope the results.
 *
 * context_id is polymorphic with no FK, so which id it holds depends entirely
 * on context_type. See lib/test-run-scope.ts for the mapping and why it is
 * written down rather than inferred at each call site.
 */
async function buildRunOptions(
  placement: any,
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): Promise<NexusTestResultsOptions> {
  const contextType = String(placement.context_type);
  const base: NexusTestResultsOptions = {
    placementId: placement.id,
    passingPct: placement.passing_pct ?? null,
    closesAt: placement.available_until ?? null,
  };

  if (!canBuildRoster(contextType)) return base;

  let classroomId: string | null = null;
  let coveredClassIds: string[] = [];

  if (CLASSROOM_ANCHORED_CONTEXTS.has(contextType)) {
    classroomId = placement.context_id;
    // No linked lecture, so decideAutoBucket makes everyone enrolled mandatory,
    // which is the correct reading of what "Assign to the class" always meant.
    coveredClassIds = [];
  } else if (CLASS_ANCHORED_CONTEXTS.has(contextType)) {
    const { data, error } = await supabase
      .from('nexus_scheduled_classes' as any)
      .select('id, classroom_id')
      .eq('id', placement.context_id)
      .maybeSingle();
    // Loud rather than degraded: a swallowed error here would show a teacher an
    // empty roster and no reason why, which reads as "nobody was set this".
    if (error) throw error;
    classroomId = (data as any)?.classroom_id ?? null;
    coveredClassIds = data ? [placement.context_id] : [];
  }

  // Per-student access: who the teacher (or catch-up) let back in, and who is
  // still waiting on an answer. Without these the roster would report a
  // reopened student as "missed", which is the opposite of what happened.
  const [access, overrides] = await Promise.all([
    loadAccessRequestsForRun(placement.id, supabase).catch(() => []),
    loadRunEligibilityOverrides(placement.id, supabase).catch(() => new Map()),
  ]);
  const windowsByStudent: Record<string, string | null> = {};
  const pendingRequestStudentIds: string[] = [];
  for (const a of access) {
    if (a.status === 'granted') windowsByStudent[a.student_id] = a.closes_at;
    else if (a.status === 'pending') pendingRequestStudentIds.push(a.student_id);
  }
  const withAccess = { ...base, windowsByStudent, pendingRequestStudentIds };

  if (!classroomId) return withAccess;

  // The run's own covered classes when it has them, falling back to the host
  // class. A run created before nexus_test_run_covered_classes existed has no
  // rows until the migration's backfill gives it the host one.
  let covered = coveredClassIds;
  try {
    const stored = await listRunCoveredClasses(placement.id, supabase);
    if (stored.length > 0) covered = stored;
  } catch {
    // Table missing on this environment. The host class is still a correct
    // answer, so fall through rather than showing an empty roster.
  }

  const facts = await loadEligibilityFactsForPreview(classroomId, covered, supabase);
  const roster = buildExamEligibilityRoster({
    students: facts.students as any,
    coveredClasses: facts.coveredClasses as any,
    attendance: facts.attendance as any,
    absences: facts.absences as any,
    overrides: overrides as any,
  });

  return {
    ...withAccess,
    roster: roster.map((r) => ({
      student_id: r.student_id,
      name: r.name,
      avatar_url: r.avatar_url,
      bucket: r.bucket,
      is_mandatory: r.is_mandatory,
    })),
  };
}

/**
 * Every run of this paper, so the teacher can move between them.
 *
 * Attempt counts come from one grouped read rather than one query per run. The
 * "Unassigned" entry matters more than it looks: attempts recorded before
 * placements existed carry a null placement_id, and without somewhere to show
 * them they would simply vanish from every scoped view with no explanation.
 */
async function buildRuns(
  testId: string,
  placements: any[],
  supabase: ReturnType<typeof getSupabaseAdminClient>,
) {
  const [{ data: attempts, error }, labels] = await Promise.all([
    supabase
      .from('nexus_test_attempts' as any)
      .select('placement_id')
      .eq('test_id', testId)
      .eq('status', 'submitted')
      .eq('mode', 'official'),
    resolvePlacementLabels(
      placements.map((p) => ({ context_type: p.context_type, context_id: p.context_id })),
      supabase,
    ),
  ]);
  if (error) throw error;

  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const a of (attempts || []) as any[]) {
    if (!a.placement_id) {
      unassigned += 1;
      continue;
    }
    counts.set(a.placement_id, (counts.get(a.placement_id) || 0) + 1);
  }

  const runs = placements.map((p) => ({
    placement_id: p.id,
    door: classifyRunDoor(p.context_type),
    context_type: p.context_type,
    label: buildRunLabel({
      contextType: p.context_type,
      contextLabel: labels.get(`${p.context_type}:${p.context_id}`)?.label ?? null,
      opensAt: p.available_from ?? null,
      closesAt: p.available_until ?? null,
    }),
    opens_at: p.available_from ?? null,
    closes_at: p.available_until ?? null,
    attempts: counts.get(p.id) || 0,
    is_active: p.is_active !== false,
  }));

  if (unassigned > 0) {
    runs.push({
      placement_id: null as any,
      door: 'other',
      context_type: null,
      label: `Unassigned attempts (${unassigned})`,
      opens_at: null,
      closes_at: null,
      attempts: unassigned,
      is_active: true,
    });
  }

  return runs;
}

/**
 * What each student did with this SAME PAPER through a different door.
 *
 * The screen that prompted this showed four students as "Missed the date" and
 * stopped there. One of them, the top scorer on the paper, had sat it seven
 * times through the book and got 100%. Both facts were true and only the
 * damning one was on screen, at exactly the moment a teacher decides who to
 * chase.
 *
 * This does NOT change who counts as having sat the run. Self-study is not the
 * class test and merging them would destroy the only number that says what the
 * class knew on the day. It sits beside the status as context, never inside it.
 *
 * One grouped read for the whole roster. Submitted official attempts only,
 * matching every other count on the page.
 */
interface ElsewhereFacts {
  attempts: number;
  best_percentage: number | null;
  last_at: string | null;
}
type ElsewhereByStudent = Record<string, ElsewhereFacts>;

async function loadElsewhereAttempts(
  testId: string,
  placementId: string,
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): Promise<ElsewhereByStudent> {
  try {
    const { data, error } = await (supabase as any)
      .from('nexus_test_attempts')
      .select('student_id, percentage, submitted_at, placement_id')
      .eq('test_id', testId)
      .eq('status', 'submitted')
      .eq('mode', 'official');
    if (error) throw error;

    const out: ElsewhereByStudent = {};
    for (const a of (data || []) as any[]) {
      // Everything that is not this run. A null placement_id is a sitting from
      // before placements existed, which is still not this run.
      if (a.placement_id === placementId) continue;
      const cur = out[a.student_id] || { attempts: 0, best_percentage: null, last_at: null };
      cur.attempts += 1;
      // percentage is NUMERIC, so PostgREST sends it as a string.
      const pct = a.percentage == null ? null : Number(a.percentage);
      if (pct != null && Number.isFinite(pct) && (cur.best_percentage == null || pct > cur.best_percentage)) {
        cur.best_percentage = pct;
      }
      if (a.submitted_at && (!cur.last_at || a.submitted_at > cur.last_at)) cur.last_at = a.submitted_at;
      out[a.student_id] = cur;
    }
    return out;
  } catch (err) {
    // Context, not the report. Losing it must never cost the teacher the roster.
    console.warn('[test results] elsewhere attempts skipped:', (err as Error)?.message);
    return {};
  }
}
