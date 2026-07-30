import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  loadClassFacts,
  toFacts,
  resolveCatchupBacklog,
  summariseCatchupBacklog,
  summariseMissedClasses,
  missedClassDueOn,
  isOverdue,
  istTodayYmd,
} from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { computeCatchupPace } from '@/lib/catchup-pace';

export const dynamic = 'force-dynamic';

/**
 * GET /api/catchup/overview?classroomId=
 *
 * Everything the teacher's catch-up screen needs, in one payload: who is behind,
 * what each student still owes class by class, how each class is doing across
 * the cohort, and which classes nobody can catch up on.
 *
 * Reads nexus_class_absences for the whole classroom in one pass. It used to
 * list active journeys and then call getCatchupBacklog once per journey, which
 * had two problems: an ordinary absence has no journey so it was invisible
 * (which is why this screen was empty while seventy-seven absences sat in the
 * table), and one round trip per student does not survive a cohort of fifty.
 */

/** A classroom's whole term, capped so one runaway query cannot stall the page. */
const MAX_ITEMS = 4000;

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();

    // Gate on the capability, never on user_type === 'admin': the staff tiers
    // exist precisely so a manager can do coordination work without being an
    // admin.
    if (!staff || !canUser(staff, 'coord.attendance.view')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    let classroomId = request.nextUrl.searchParams.get('classroomId');
    if (!classroomId) {
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('id')
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      classroomId = classroom?.id || null;
    }
    const emptyPayload = {
      classroomId,
      students: [],
      classes: [],
      classStats: [],
      noRecording: [],
      pendingRecap: [],
      totals: { studentsBehind: 0, studentsCatchingUp: 0, outstanding: 0, clearedThisMonth: 0 },
    };
    if (!classroomId) return NextResponse.json(emptyPayload);

    // ── One read of the whole classroom's catch-up state ────────────────────
    const { data: rows } = await supabase
      .from('nexus_class_absences')
      .select(
        'id, student_id, scheduled_class_id, kind, recording_watched_at, caught_up_at, ' +
          'test_unlocked_at, test_passed_at, excused_at, reason_code, ' +
          'class:nexus_scheduled_classes(id, title, scheduled_date, start_time, status, ' +
          'recording_url, youtube_url)',
      )
      .eq('classroom_id', classroomId)
      .limit(MAX_ITEMS);

    const items = (rows || []).filter((r: any) => r.class);
    if (items.length === 0) return NextResponse.json(emptyPayload);

    const studentIds = [...new Set(items.map((i: any) => i.student_id))] as string[];
    const classIds = [...new Set(items.map((i: any) => i.scheduled_class_id))] as string[];

    const [{ data: users }, { data: journeys }, { data: classDates }, { data: attendance }] =
      await Promise.all([
        supabase.from('users').select('id, name, email, avatar_url, phone').in('id', studentIds),
        supabase
          .from('nexus_catchup_journeys')
          .select('id, student_id, started_on, weekly_quota, status')
          .eq('classroom_id', classroomId),
        supabase
          .from('nexus_scheduled_classes')
          .select('scheduled_date')
          .eq('classroom_id', classroomId)
          .eq('publish_state', 'published')
          .neq('status', 'cancelled')
          .order('scheduled_date', { ascending: true }),
        supabase
          .from('nexus_attendance')
          .select('scheduled_class_id, attended')
          .in('scheduled_class_id', classIds),
      ]);

    const userById = new Map<string, any>((users || []).map((u: any) => [u.id, u]));
    const journeyByStudent = new Map<string, any>(
      (journeys || []).map((j: any) => [j.student_id, j]),
    );

    // The classroom timetable, deduped, so "when did the course next run" is one
    // in-memory lookup rather than a query per missed class.
    const termDates: string[] = [];
    for (const c of classDates || []) {
      const ymd = String(c.scheduled_date).slice(0, 10);
      if (termDates[termDates.length - 1] !== ymd) termDates.push(ymd);
    }
    const nextClassAfter = (ymd: string): string | null =>
      termDates.find((d) => d > String(ymd).slice(0, 10)) ?? null;

    const presentByClass = new Map<string, number>();
    for (const a of attendance || []) {
      if (!a.attended) continue;
      presentByClass.set(a.scheduled_class_id, (presentByClass.get(a.scheduled_class_id) || 0) + 1);
    }

    const today = istTodayYmd();
    const monthStart = `${today.slice(0, 7)}-01`;

    // ── Per student ─────────────────────────────────────────────────────────
    const byStudent = new Map<string, any[]>();
    for (const i of items) {
      const list = byStudent.get(i.student_id) || [];
      list.push(i);
      byStudent.set(i.student_id, list);
    }

    const classColumns = new Map<string, any>();
    const noRecording = new Map<string, any>();
    const pendingRecap = new Map<string, any>();
    const classStat = new Map<string, { missed: number; caughtUp: number; outstanding: number }>();

    const students: any[] = [];
    let outstandingTotal = 0;
    let clearedThisMonth = 0;

    for (const [studentId, studentItems] of byStudent) {
      studentItems.sort((a: any, b: any) => {
        const d = String(a.class.scheduled_date).localeCompare(String(b.class.scheduled_date));
        if (d !== 0) return d;
        return String(a.class.start_time || '').localeCompare(String(b.class.start_time || ''));
      });

      const facts = await loadClassFacts(
        supabase,
        studentId,
        studentItems.map((i: any) => i.scheduled_class_id),
      );
      const resolved = resolveCatchupBacklog(studentItems.map((i: any) => toFacts(i, facts)));

      // Only an `open` item has a deadline. Same rule as getCatchupBacklog: a
      // class with no recording, or one still waiting on its recap, is our
      // homework and must never be shown as the student's.
      const dueOn = studentItems.map((i: any, idx: number) =>
        resolved[idx].status === 'open'
          ? missedClassDueOn(i.class.scheduled_date, nextClassAfter(i.class.scheduled_date))
          : null,
      );
      const overdueFlags = dueOn.map((d: string | null) => isOverdue(d, today));

      const totals = summariseCatchupBacklog(resolved);
      const missedTotals = summariseMissedClasses(resolved, overdueFlags);

      const journey = journeyByStudent.get(studentId) || null;
      const pace = journey
        ? computeCatchupPace({
            started_on: journey.started_on,
            weekly_quota: journey.weekly_quota ?? 2,
            total_items: totals.total,
            completed_items: totals.completed,
          })
        : { state: 'done' as const, deficit: 0, remaining: 0, weeks_elapsed: 0, expected_by_now: 0, next_due_on: null, finish_by: null };

      const shaped = studentItems.map((i: any, idx: number) => {
        const r = resolved[idx];
        const work = facts.assignmentsByClass.get(i.scheduled_class_id) || [];

        classColumns.set(i.scheduled_class_id, {
          id: i.scheduled_class_id,
          title: i.class.title,
          scheduled_date: i.class.scheduled_date,
        });

        const stat = classStat.get(i.scheduled_class_id) || {
          missed: 0,
          caughtUp: 0,
          outstanding: 0,
        };
        stat.missed += 1;
        if (r.status === 'done' || r.status === 'excused') stat.caughtUp += 1;
        else if (r.status !== 'blocked') stat.outstanding += 1;
        classStat.set(i.scheduled_class_id, stat);

        if (r.status === 'blocked') {
          const prev = noRecording.get(i.scheduled_class_id);
          noRecording.set(i.scheduled_class_id, {
            id: i.scheduled_class_id,
            title: i.class.title,
            scheduled_date: i.class.scheduled_date,
            affected: (prev?.affected || 0) + 1,
          });
        }
        if (r.status === 'pending_teacher') {
          const prev = pendingRecap.get(i.scheduled_class_id);
          pendingRecap.set(i.scheduled_class_id, {
            id: i.scheduled_class_id,
            title: i.class.title,
            scheduled_date: i.class.scheduled_date,
            affected: (prev?.affected || 0) + 1,
          });
        }
        if (i.caught_up_at && String(i.caught_up_at).slice(0, 10) >= monthStart) clearedThisMonth += 1;

        return {
          id: i.id,
          scheduled_class_id: i.scheduled_class_id,
          kind: i.kind,
          status: r.status,
          step: r.step,
          chained: r.chained,
          due_on: dueOn[idx],
          overdue: overdueFlags[idx],
          reason_code: i.reason_code ?? null,
          watched: !!facts.recapByClass.get(i.scheduled_class_id)
            ? facts.completedRecaps.has(facts.recapByClass.get(i.scheduled_class_id)!.id)
            : !!i.recording_watched_at,
          assignments_outstanding: work.filter((a: any) => !facts.submitted.has(a.id)).length,
          assignments_total: work.length,
          has_test: facts.testByClass.has(i.scheduled_class_id),
          test_passed: !!i.test_passed_at,
          excused: !!i.excused_at,
          class: {
            title: i.class.title,
            scheduled_date: i.class.scheduled_date,
          },
        };
      });

      const openCount = missedTotals.open + (totals.total - totals.completed);
      outstandingTotal += openCount;

      // A student with nothing left is not a work item. They stay out of the
      // list entirely rather than padding it with rows that read as green noise.
      if (openCount === 0) continue;

      const user = userById.get(studentId);
      students.push({
        journey_id: journey?.id ?? null,
        student: {
          id: studentId,
          name: user?.name ?? null,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
          avatar_url: user?.avatar_url ?? null,
        },
        started_on: journey?.started_on ?? null,
        weekly_quota: journey?.weekly_quota ?? null,
        totals,
        missedTotals,
        pace,
        items: shaped,
      });
    }

    // Sorted as a work queue, not a register: overdue first, then most behind,
    // then the biggest pile.
    students.sort(
      (a, b) =>
        b.missedTotals.overdue - a.missedTotals.overdue ||
        b.pace.deficit - a.pace.deficit ||
        b.missedTotals.open - a.missedTotals.open,
    );

    const classes = [...classColumns.values()].sort((a, b) =>
      String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
    );

    const classStats = classes
      .map((c) => {
        const s = classStat.get(c.id) || { missed: 0, caughtUp: 0, outstanding: 0 };
        return { ...c, ...s, present: presentByClass.get(c.id) || 0 };
      })
      .sort((a, b) => b.outstanding - a.outstanding || String(b.scheduled_date).localeCompare(String(a.scheduled_date)));

    return NextResponse.json({
      classroomId,
      students,
      classes,
      classStats,
      noRecording: [...noRecording.values()].sort((a, b) =>
        String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
      ),
      pendingRecap: [...pendingRecap.values()].sort((a, b) =>
        String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
      ),
      totals: {
        studentsBehind: students.filter((s) => s.missedTotals.overdue > 0 || s.pace.state === 'behind')
          .length,
        studentsCatchingUp: students.length,
        outstanding: outstandingTotal,
        clearedThisMonth,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the catch-up overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
