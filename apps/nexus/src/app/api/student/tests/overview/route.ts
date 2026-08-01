import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import {
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
 */
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

    // 2. The student's own papers.
    const { data: ownTests } = await supabase
      .from('nexus_tests')
      .select('id, title, folder_id, test_kind, total_marks, created_at')
      .eq('created_by_student', studentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const placedTestIds = [...new Set(placementRows.map((p: any) => p.test_id))];
    const ownTestIds = (ownTests || []).map((t: any) => t.id);
    const allTestIds = [...new Set([...placedTestIds, ...ownTestIds])];

    const testMap = new Map<string, any>();
    const questionCounts = new Map<string, number>();
    if (allTestIds.length > 0) {
      const [{ data: tests }, { data: tqRows }] = await Promise.all([
        supabase
          .from('nexus_tests')
          .select('id, title, description, folder_id, test_kind, test_type, duration_minutes, total_marks, passing_marks, is_published, is_active')
          .in('id', allTestIds),
        supabase.from('nexus_test_questions').select('test_id').in('test_id', allTestIds).range(0, 100000),
      ]);
      for (const t of tests || []) testMap.set(t.id, t);
      for (const r of tqRows || []) questionCounts.set(r.test_id, (questionCounts.get(r.test_id) || 0) + 1);
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
    due.sort((a, b) => String(a.available_until || '9999').localeCompare(String(b.available_until || '9999')));

    // Closed last, then soonest deadline. A student opening this list wants the
    // live work first and the archive underneath.
    const STATUS_RANK: Record<string, number> = { open: 0, upcoming: 1, done: 2, closed: 3 };
    all.sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
        String(a.available_until || '9999').localeCompare(String(b.available_until || '9999')),
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

    return NextResponse.json({
      data: {
        due,
        all,
        practice_groups: [...practiceGroups.values()].sort((a, b) => a.label.localeCompare(b.label)),
        mine,
        recent,
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
