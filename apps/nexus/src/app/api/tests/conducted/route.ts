import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, listExamsForClassroom, loadRunSittings } from '@neram/database';
import { resolveExamCaller, isStaff, loadExamRoster } from '@/lib/exam-access';
import {
  buildConductedRuns,
  parseIncludeParam,
  tallyAttempts,
  type ConductedRunInput,
} from '@/lib/conducted-runs';

/**
 * GET /api/tests/conducted?classroom_id=<uuid>&include=exam,class_test,assigned   (staff)
 *
 * Every test one classroom has actually sat, newest first.
 *
 * This did not exist, and neither did any other route that could answer it. The
 * paper library lists PAPERS; an exam lives on nexus_exams and is reachable only
 * from /teacher/timetable/[classId]/exam, which needs you to already know which
 * class it hung off; and /teacher/exams is a different feature entirely (the
 * external NATA and JEE date journey). listExamsForClassroom has existed all
 * along with no UI consumer.
 *
 * One classroom per request rather than "everything the teacher can see": the
 * Nexus shell already has a classroom switcher and every sibling screen scopes
 * to it, and a cross-classroom read would mean a roster count per classroom for
 * a comparison nobody asked for.
 *
 * Deliberately not force-dynamic and not polled. This is a record of things
 * that have already happened, so nothing on it changes minute to minute.
 */
export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveExamCaller(request.headers.get('Authorization'));
    if (!resolved.ok) return resolved.response;
    if (!isStaff(resolved.caller)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const url = new URL(request.url);
    const classroomId = url.searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }
    const include = parseIncludeParam(url.searchParams.get('include'));

    const supabase = getSupabaseAdminClient() as any;

    const [classroom, classes, exams, rosterIds] = await Promise.all([
      supabase.from('nexus_classrooms').select('id, name').eq('id', classroomId).maybeSingle(),
      supabase
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date')
        .eq('classroom_id', classroomId),
      listExamsForClassroom(classroomId),
      loadExamRoster(classroomId).then((r) => r.map((s: { id: string }) => s.id)),
    ]);
    const enrolled = rosterIds.length;

    if (classes.error) throw classes.error;
    const classRows = (classes.data || []) as any[];
    const classById = new Map<string, { title: string | null; scheduled_date: string | null }>(
      classRows.map((c) => [c.id, { title: c.title ?? null, scheduled_date: c.scheduled_date ?? null }]),
    );
    const classroomName = (classroom.data as any)?.name ?? null;

    // Exam windows and results_state, keyed by the class the exam hangs off.
    // The exam placement's own available_from / available_until mirror these,
    // but results_state lives only on nexus_exams and is the one fact on the row
    // a teacher can act on straight away.
    const examByClass = new Map<string, any>();
    for (const e of exams) examByClass.set((e as any).scheduled_class_id, e);

    const placements = await loadPlacements(supabase, classroomId, [...classById.keys()]);
    if (placements.length === 0) {
      return respond([], classroomName, enrolled);
    }

    const testIds = [...new Set(placements.map((p) => p.test_id))];
    const { data: tests, error: testErr } = await supabase
      .from('nexus_tests')
      .select('id, title')
      .in('id', testIds);
    if (testErr) throw testErr;
    const titleById = new Map<string, string | null>(((tests || []) as any[]).map((t) => [t.id, t.title ?? null]));

    const inputs: ConductedRunInput[] = placements.map((p) => {
      const cls = classById.get(p.context_id);
      const exam = p.context_type === 'exam' ? examByClass.get(p.context_id) : null;
      return {
        placement_id: p.id,
        test_id: p.test_id,
        paper_title: titleById.get(p.test_id) ?? null,
        context_type: p.context_type,
        class_title: cls?.title ?? null,
        class_date: cls?.scheduled_date ?? null,
        classroom_name: classroomName,
        opens_at: exam?.opens_at ?? p.available_from ?? null,
        closes_at: exam?.closes_at ?? p.available_until ?? null,
        due_at: readDueAt(p.gating),
        // The run's own bar, never the paper's. See tallyAttempts.
        passing_pct: toPct(exam?.passing_pct) ?? toPct(p.passing_pct),
        results_state: exam?.results_state ?? null,
      };
    });

    const rows = buildConductedRuns({
      inputs,
      tallies: await tallyFor(supabase, inputs, rosterIds),
      enrolled,
      include,
    });

    return respond(rows, classroomName, enrolled);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load conducted tests';
    console.error('[Conducted tests] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function respond(rows: unknown[], classroomName: string | null, enrolled: number) {
  return NextResponse.json(
    { data: { runs: rows, classroom_name: classroomName, enrolled } },
    { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
  );
}

/** gating.due_at, read without trusting the JSON's shape. */
function readDueAt(gating: unknown): string | null {
  const g = (gating || {}) as Record<string, unknown>;
  return typeof g.due_at === 'string' ? g.due_at : null;
}

/**
 * A pass mark as a number, whichever table it came from.
 *
 * nexus_exams.passing_pct is NUMERIC and PostgREST sends it as the string
 * "80.00", while nexus_test_placements.passing_pct is an integer and arrives as
 * 85. Comparing a percentage against the string would happen to work through JS
 * coercion, which is exactly the kind of accident that survives until someone
 * adds a second comparison that does not.
 */
function toPct(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const CLASS_ANCHORED = ['exam', 'class_test', 'catchup_class', 'class_prep_test'];

/**
 * Every placement that could be a conducted run, in two reads.
 *
 * Split by what context_id points at, which is polymorphic with no FK: the four
 * class-anchored contexts hold a nexus_scheduled_classes id, while
 * classroom_assignment holds the classroom id itself. Filtering both in one
 * query would mean matching classroom ids against class ids and finding nothing.
 *
 * Both reads check `error` and throw. These are ENUM values, and on an
 * environment where a migration has not landed PostgREST answers an enum filter
 * with an error and no rows rather than an empty set. Destructuring `data`
 * alone would render "this class has never sat a test" to a teacher whose class
 * has sat twenty, with nothing anywhere saying why. loadClassTests:164 carries
 * the same reasoning at length.
 */
async function loadPlacements(supabase: any, classroomId: string, classIds: string[]): Promise<any[]> {
  const COLUMNS = 'id, test_id, context_type, context_id, available_from, available_until, passing_pct, gating';

  const [byClass, byClassroom] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from('nexus_test_placements')
          .select(COLUMNS)
          .eq('is_active', true)
          .in('context_type', CLASS_ANCHORED)
          .in('context_id', classIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('nexus_test_placements')
      .select(COLUMNS)
      .eq('is_active', true)
      .eq('context_type', 'classroom_assignment')
      .eq('context_id', classroomId),
  ]);

  if (byClass.error) throw byClass.error;
  if (byClassroom.error) throw byClassroom.error;

  return [...((byClass.data || []) as any[]), ...((byClassroom.data || []) as any[])];
}

/**
 * How many sat each run, how many attempts, how many passed.
 *
 * ONE grouped read for every run on the screen, tallied in memory, rather than
 * a query per row. Submitted official attempts only, matching every other
 * surface that reports a score: abandoned sittings would inflate "sat it" into
 * a number a teacher reads as effort.
 */
async function tallyFor(supabase: any, inputs: ConductedRunInput[], rosterIds: string[]) {
  if (inputs.length === 0) return {};

  // Who sat each run is decided by run-sittings.ts, the rule every results
  // screen shares, so this count agrees with the run's own Students tab. A
  // sitting through another door inside the window, or a teacher's count, is one
  // attempt: the practice tries around it are not the run. Bounded to the
  // classroom's roster, because the read spans every door of these papers.
  const sittings = await loadRunSittings<any>(
    inputs.map((i) => ({
      id: i.placement_id,
      test_id: i.test_id,
      available_from: i.opens_at,
      available_until: i.closes_at,
    })),
    { studentIds: rosterIds, columns: 'percentage' },
    supabase,
  );

  const rows: Array<{ placement_id: string; student_id: string; percentage: number | string | null }> = [];
  for (const [placementId, byStudent] of sittings) {
    for (const sitting of byStudent.values()) {
      const counted = sitting.source === 'run' ? sitting.attempts : sitting.first ? [sitting.first] : [];
      for (const a of counted) {
        if (a.status !== 'submitted') continue;
        rows.push({ placement_id: placementId, student_id: sitting.student_id, percentage: a.percentage ?? null });
      }
    }
  }

  const passingByPlacement: Record<string, number | null> = {};
  for (const i of inputs) passingByPlacement[i.placement_id] = i.passing_pct;

  return tallyAttempts(rows, passingByPlacement);
}
