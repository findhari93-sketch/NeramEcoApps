import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import {
  countRowsByKey,
  getSupabaseAdminClient,
  getStudentTestStats,
  listStudentAttempts,
  listTestFolderTree,
  NEXUS_GATED_TEST_KINDS,
} from '@neram/database';

/**
 * GET /api/student/tests/overview?classroom=<id>
 *
 * Everything the student tests page shows, in one call, in the order a student
 * actually needs it:
 *
 *   due      assigned tests with an open window, soonest deadline first
 *   all      every test the class has, open or not, for the consolidated list
 *   practice the teacher's practice pool, grouped by the folder it was filed in
 *   mine     the student's own papers, in their own folders
 *   recent   the last few results
 *
 * A student should never be handed 1121 loose questions and told to get on with
 * it. This is the shape that replaces that.
 *
 * `due` and `all` overlap on purpose. `due` is the "what do I do now" list at the
 * top of the page and only holds tests still open. `all` is the consolidated
 * record of everything the teacher has set, including tests that have closed,
 * because "did I miss one" is a question a student needs answered and dropping
 * closed placements silently meant they could never see one had existed.
 *
 * Gated kinds (class prep, catch-up) are deliberately absent: they are opened
 * from the class they belong to, which is where their unlock rules are enforced.
 * Class tests ARE here, because nothing gates them: they are ordinary papers with
 * a deadline, and a student needs one list of what they owe.
 */

/**
 * How far back a class test still counts as "what do I do now".
 *
 * A window rather than the classroom's whole history, so the cost of this query
 * does not grow with the age of the classroom. Long enough that a student
 * clearing a term's backlog still finds their papers.
 */
const CLASS_TEST_LOOKBACK_DAYS = 120;

export async function GET(request: NextRequest) {
  try {
    const classroomId = new URL(request.url).searchParams.get('classroom');
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const studentId = access.caller.id;
    const isStaff = resolveStaffRole(access.caller) !== null;
    // Cast: nexus_test_placements and nexus_tests.folder_id are not in
    // database.generated.ts until it is regenerated, which waits for the
    // migrations to be on both environments.
    const supabase = getSupabaseAdminClient() as any;
    const now = new Date().toISOString();

    // 1. Placements this student can see: assigned to their classroom, or the
    //    classroom's practice pool.
    const placementRows = classroomId
      ? (
          await supabase
            .from('nexus_test_placements')
            .select('id, test_id, context_type, passing_pct, available_from, available_until, gating')
            .in('context_type', ['classroom_assignment', 'student_practice'])
            .eq('context_id', classroomId)
            .eq('is_active', true)
            .eq('is_visible', true)
        ).data || []
      : [];

    // 1b. Class tests: the papers set FOR a class, due after it.
    //
    // Fetched separately because their context_id is a scheduled class rather
    // than the classroom, so they cannot ride the query above. Bounded by a date
    // window so the cost does not grow with a classroom's whole history: a paper
    // set on a class from last term is not "what do I do now".
    const classTestPlacements: any[] = [];
    const classById = new Map<string, { id: string; title: string | null; scheduled_date: string }>();
    if (classroomId) {
      const windowStart = new Date(Date.now() - CLASS_TEST_LOOKBACK_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const { data: classes } = await supabase
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date')
        .eq('classroom_id', classroomId)
        .neq('status', 'cancelled')
        .gte('scheduled_date', windowStart);

      for (const c of (classes || []) as any[]) classById.set(c.id, c);

      if (classById.size > 0) {
        const { data: rows, error } = await supabase
          .from('nexus_test_placements')
          .select('id, test_id, context_type, context_id, passing_pct, available_from, available_until, gating')
          .eq('context_type', 'class_test')
          .in('context_id', [...classById.keys()])
          .eq('is_active', true)
          .eq('is_visible', true);
        // 'class_test' is an enum value, so on a database the migration has not
        // reached this comes back as an error with no rows. Swallowing it would
        // show every student an empty To do list and tell nobody why.
        if (error) throw error;
        classTestPlacements.push(...((rows || []) as any[]));
      }
    }

    // 2. The student's own papers.
    const { data: ownTests } = await supabase
      .from('nexus_tests')
      .select('id, title, folder_id, test_kind, total_marks, created_at')
      .eq('created_by_student', studentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const placedTestIds = [
      ...new Set([
        ...placementRows.map((p: any) => p.test_id),
        ...classTestPlacements.map((p: any) => p.test_id),
      ]),
    ];
    const ownTestIds = (ownTests || []).map((t: any) => t.id);
    const allTestIds = [...new Set([...placedTestIds, ...ownTestIds])];

    const testMap = new Map<string, any>();
    let questionCounts = new Map<string, number>();
    if (allTestIds.length > 0) {
      // Paged to exhaustion. `.range(0, 100000)` looks like "everything" but
      // PostgREST caps the response at 1000 rows and says nothing, so a student
      // with enough tests between them was shown "0 questions" on papers that
      // hold fifty. See @neram/database utils/paged-rows.ts.
      const [{ data: tests }, counts] = await Promise.all([
        supabase
          .from('nexus_tests')
          .select('id, title, description, folder_id, test_kind, test_type, duration_minutes, total_marks, passing_marks, is_published, is_active')
          .in('id', allTestIds),
        countRowsByKey(
          () => supabase.from('nexus_test_questions').select('test_id').in('test_id', allTestIds),
          'test_id',
        ),
      ]);
      for (const t of tests || []) testMap.set(t.id, t);
      questionCounts = counts;
    }

    const stats = await getStudentTestStats(studentId, allTestIds, supabase);
    const folderNames = new Map<string, string>();
    try {
      const { tree } = await listTestFolderTree({ scope: 'staff' }, supabase);
      const walk = (nodes: any[], prefix: string) => {
        for (const n of nodes) {
          const label = prefix ? `${prefix} > ${n.name}` : n.name;
          folderNames.set(n.id, label);
          walk(n.children || [], label);
        }
      };
      walk(tree, '');
    } catch {
      // Folder names are a nicety. Losing them must not cost the student the page.
    }

    const shape = (testId: string, placement?: any) => {
      const t = testMap.get(testId);
      if (!t || !t.is_active || !t.is_published) return null;
      // Gated papers must not appear in a generic list: opening one here would
      // skip the unlock check that is the entire point of them.
      if ((NEXUS_GATED_TEST_KINDS as readonly string[]).includes(t.test_kind)) return null;
      const s = stats.get(testId);
      const attempts = s?.attempts ?? 0;
      const from = placement?.available_from ?? null;
      const until = placement?.available_until ?? null;

      // One word for where this test stands, resolved here so the page never has
      // to re-derive it from three nullable dates and an attempt count.
      const status: 'upcoming' | 'closed' | 'done' | 'open' =
        from && from > now ? 'upcoming' : until && until < now ? 'closed' : attempts > 0 ? 'done' : 'open';

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        folder_id: t.folder_id,
        folder_label: t.folder_id ? folderNames.get(t.folder_id) || null : null,
        question_count: questionCounts.get(t.id) || 0,
        test_type: t.test_type,
        test_kind: t.test_kind,
        duration_minutes: t.duration_minutes,
        placement_id: placement?.id ?? null,
        placement_context: placement?.context_type ?? null,
        passing_pct: placement?.passing_pct ?? null,
        available_from: from,
        available_until: until,
        attempt_limit: Number((placement?.gating as any)?.attempt_limit) || null,
        attempts,
        best_percentage: s?.best_percentage ?? null,
        last_submitted_at: s?.last_submitted_at ?? null,
        status,
        // Class-test fields, null on everything else so the page never has to
        // check which kind of item it is holding.
        due_at: null as string | null,
        required: null as boolean | null,
        class_id: null as string | null,
        class_title: null as string | null,
      };
    };

    /**
     * A class test, shaped for the same card as everything else.
     *
     * The deadline goes in `due_at`, NEVER in `available_until`. The card
     * disables itself on a passed available_until, and a class test that a
     * student is late for must stay openable: the reminder we send them says
     * "finish it", and a required one has to be clearable from a catch-up
     * backlog weeks later. Late is late, not locked.
     */
    const shapeClassTest = (p: any) => {
      const item = shape(p.test_id, p);
      if (!item) return null;
      const cls = classById.get(p.context_id);
      const gating = (p.gating || {}) as Record<string, unknown>;
      const bar = p.passing_pct ?? null;
      const best = item.best_percentage;
      const passed = bar == null ? item.attempts > 0 : best != null && best >= bar;

      return {
        ...item,
        // Not 'done' merely because they opened it. A required paper with a pass
        // mark is done when it is passed, and calling a failed attempt "done"
        // would drop it out of the To do filter that is meant to chase it.
        status: passed ? ('done' as const) : ('open' as const),
        due_at: typeof gating.due_at === 'string' ? gating.due_at : null,
        required: gating.required !== false,
        class_id: p.context_id,
        class_title: cls?.title ?? null,
      };
    };

    const due: any[] = [];
    const practice: any[] = [];
    const all: any[] = [];
    for (const p of placementRows as any[]) {
      const item = shape(p.test_id, p);
      if (!item) continue;

      // Everything the class has, closed included. This is the consolidated list.
      all.push(item);

      // Not open yet is still worth showing at the top (it tells them it is
      // coming); already closed is not, because there is nothing they can do
      // about it now. It still appears in `all` with a Closed chip.
      if (item.status === 'closed') continue;
      if (p.context_type === 'classroom_assignment') due.push(item);
      else practice.push(item);
    }

    // Class tests join the same two lists. They are never dropped for being
    // closed, because they never close.
    for (const p of classTestPlacements) {
      const item = shapeClassTest(p);
      if (!item) continue;
      all.push(item);
      if (item.status !== 'done') due.push(item);
    }

    due.sort((a, b) =>
      String(a.due_at || a.available_until || '9999').localeCompare(
        String(b.due_at || b.available_until || '9999'),
      ),
    );

    // Closed last, then soonest deadline. A student opening this list wants the
    // live work first and the archive underneath.
    const STATUS_RANK: Record<string, number> = { open: 0, upcoming: 1, done: 2, closed: 3 };
    all.sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
        String(a.due_at || a.available_until || '9999').localeCompare(
          String(b.due_at || b.available_until || '9999'),
        ),
    );

    // Practice grouped by the folder the teacher filed it in, so "Foundation >
    // History of Architecture" reads the same on both sides of the app.
    const practiceGroups = new Map<string, { key: string; label: string; tests: any[] }>();
    for (const t of practice) {
      const key = t.folder_id || 'unfiled';
      const label = t.folder_label || 'More practice';
      if (!practiceGroups.has(key)) practiceGroups.set(key, { key, label, tests: [] });
      practiceGroups.get(key)!.tests.push(t);
    }

    const mine = (ownTests || [])
      .map((t: any) => shape(t.id))
      .filter(Boolean)
      .map((t: any) => ({ ...t, folder_label: null }));

    const recent = await listStudentAttempts(studentId, { limit: 5 }, supabase);

    /**
     * Sittings this student walked away from and has not explained.
     *
     * Asked here rather than at the moment of abandoning, because abandoning
     * happens on page unload via navigator.sendBeacon, where there is no UI and
     * no opportunity to ask anything at all. So the attempt is recorded first
     * and the question is put the next time they open this page.
     *
     * Deliberately NOT asked about attempts still `in_progress`: those are
     * resumable, and "why did you stop" is the wrong question for something the
     * student is about to walk back into.
     *
     * Capped at three. A student returning after a bad week should be asked
     * about their most recent stumbles, not handed a backlog of interrogations.
     */
    let needsReason: any[] = [];
    try {
      // The title comes from an embed rather than from testMap, because an
      // abandoned attempt can belong to a paper that is no longer placed
      // anywhere, and those are exactly the ones worth asking about.
      const { data: stalled } = await supabase
        .from('nexus_test_attempts')
        .select('id, test_id, submitted_at, created_at, test:nexus_tests!inner(id, title, is_active)')
        .eq('student_id', studentId)
        .eq('status', 'abandoned')
        .is('abandon_reason_code', null)
        .order('created_at', { ascending: false })
        .limit(3);

      needsReason = ((stalled || []) as any[])
        .filter((a) => a.test?.is_active)
        .map((a) => ({
          attempt_id: a.id,
          test_id: a.test_id,
          title: a.test?.title || 'a test',
          stopped_at: a.submitted_at || a.created_at,
        }));
    } catch {
      // Being asked why you stopped is a nicety. A failure here must never cost
      // the student the page that lists their actual work.
    }

    return NextResponse.json({
      data: {
        due,
        all,
        practice_groups: [...practiceGroups.values()].sort((a, b) => a.label.localeCompare(b.label)),
        mine,
        recent,
        needs_reason: needsReason,
        is_staff_preview: isStaff,
        /**
         * False when the request arrived with no classroom. The page needs to
         * tell those apart: "no classroom selected" and "your teacher has not
         * set anything" look identical otherwise, and only one of them is the
         * student's problem to fix.
         */
        has_classroom: Boolean(classroomId),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your tests';
    console.error('Student tests overview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
