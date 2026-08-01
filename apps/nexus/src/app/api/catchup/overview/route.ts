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
import { tallyReasons } from '@/lib/rsvp-reasons';

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

/** How many past classes the Classes and recaps tab covers. */
const RECENT_CLASSES = 60;

/** How far back the Caught up tab looks. Older wins are history, not a work list. */
const COMPLETED_WINDOW_DAYS = 60;

/** Cap on the Reasons feed, which is read newest first. */
const MAX_REASONS = 200;

/** Plain date arithmetic on a YYYY-MM-DD, no timezone reinterpretation. */
function ymdDaysAgo(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * What a teacher still owes a class, from the class's own point of view.
 * `recording_ready` is the one that matters: there is something to watch but
 * nothing gated to watch it with, so every absent student is stuck on us.
 */
function recapStateFor(
  cls: { recording_url?: string | null; youtube_url?: string | null },
  recap: { status: string } | undefined,
): 'no_recording' | 'recording_ready' | 'draft' | 'published' {
  if (recap?.status === 'published') return 'published';
  if (recap) return 'draft';
  return cls.recording_url || cls.youtube_url ? 'recording_ready' : 'no_recording';
}

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
    if (!classroomId) {
      return NextResponse.json({
        classroomId,
        students: [],
        classes: [],
        classStats: [],
        reasons: [],
        reasonTally: { unwell: 0, family: 0, clash: 0, other: 0 },
        completed: [],
        noRecording: [],
        pendingRecap: [],
        totals: {
          studentsBehind: 0,
          studentsCatchingUp: 0,
          outstanding: 0,
          clearedThisMonth: 0,
          explained: 0,
          unexplained: 0,
        },
      });
    }

    // ── One read of the whole classroom's catch-up state ────────────────────
    const { data: rows } = await supabase
      .from('nexus_class_absences')
      .select(
        'id, student_id, scheduled_class_id, kind, recording_watched_at, caught_up_at, ' +
          'test_unlocked_at, test_passed_at, excused_at, excuse_note, detected_at, ' +
          'followup_sent_at, reason_code, reason_note, reason_submitted_at, reason_source, ' +
          'class:nexus_scheduled_classes(id, title, scheduled_date, start_time, status, ' +
          'recording_url, youtube_url)',
      )
      .eq('classroom_id', classroomId)
      .limit(MAX_ITEMS);

    const items = (rows || []).filter((r: any) => r.class);

    // Deliberately no early return on an empty absence list. A classroom where
    // nobody has missed anything can still owe recaps, and that is exactly what
    // the Classes and recaps tab exists to show.
    const studentIds = [...new Set(items.map((i: any) => i.student_id))] as string[];
    const classIds = [...new Set(items.map((i: any) => i.scheduled_class_id))] as string[];

    const [{ data: users }, { data: journeys }, { data: termClasses }] = await Promise.all([
      studentIds.length
        ? supabase.from('users').select('id, name, email, avatar_url, phone').in('id', studentIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('nexus_catchup_journeys')
        .select('id, student_id, started_on, weekly_quota, status')
        .eq('classroom_id', classroomId),
      // Widened from `scheduled_date` alone: the same rows now also feed the
      // Classes and recaps tab, which has to list a class that everybody
      // attended (it may still owe a recap) and not only the ones someone
      // missed.
      supabase
        .from('nexus_scheduled_classes')
        // teams_meeting_id rides along so the attendance panel this tab opens
        // knows whether there is anything to sync from, without a second read
        // per class the moment a teacher taps a row.
        .select(
          'id, title, scheduled_date, start_time, recording_url, youtube_url, transcript_url, teams_meeting_id',
        )
        .eq('classroom_id', classroomId)
        .eq('publish_state', 'published')
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true }),
    ]);

    const today = istTodayYmd();
    // Most recent first, capped: a teacher chasing recaps is looking at this
    // term, and an unbounded list would pull a year of attendance rows with it.
    const recentPast = (termClasses || [])
      .filter((c: any) => String(c.scheduled_date).slice(0, 10) <= today)
      .sort((a: any, b: any) => String(b.scheduled_date).localeCompare(String(a.scheduled_date)))
      .slice(0, RECENT_CLASSES);
    const recentPastIds = recentPast.map((c: any) => c.id as string);
    const attendanceIds = [...new Set([...classIds, ...recentPastIds])] as string[];

    const [{ data: attendance }, { data: recapRows }] = await Promise.all([
      attendanceIds.length
        ? supabase
            .from('nexus_attendance')
            .select('scheduled_class_id, attended')
            .in('scheduled_class_id', attendanceIds)
        : Promise.resolve({ data: [] as any[] }),
      recentPastIds.length
        ? supabase
            .from('nexus_class_recaps')
            .select('id, scheduled_class_id, status')
            .in('scheduled_class_id', recentPastIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const recapByClass = new Map<string, { id: string; status: string }>();
    for (const r of recapRows || []) {
      if (r.scheduled_class_id) {
        recapByClass.set(r.scheduled_class_id, { id: r.id, status: r.status });
      }
    }

    const userById = new Map<string, any>((users || []).map((u: any) => [u.id, u]));
    const journeyByStudent = new Map<string, any>(
      (journeys || []).map((j: any) => [j.student_id, j]),
    );

    // The classroom timetable, deduped, so "when did the course next run" is one
    // in-memory lookup rather than a query per missed class.
    const termDates: string[] = [];
    for (const c of termClasses || []) {
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

    const monthStart = `${today.slice(0, 7)}-01`;
    const completedSince = ymdDaysAgo(today, COMPLETED_WINDOW_DAYS);

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
    const classStat = new Map<
      string,
      { missed: number; caughtUp: number; outstanding: number; blocked: number }
    >();

    const students: any[] = [];
    const completed: any[] = [];
    const reasons: any[] = [];
    let outstandingTotal = 0;
    let clearedThisMonth = 0;
    let explainedTotal = 0;
    let unexplainedTotal = 0;

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
          blocked: 0,
        };
        stat.missed += 1;
        if (r.status === 'done' || r.status === 'excused') stat.caughtUp += 1;
        else if (r.status !== 'blocked') stat.outstanding += 1;
        // Waiting on us, not on them: no recording at all, or a recap still
        // unpublished. Counted separately so the Classes tab can say how many
        // people one missing recap is holding up.
        if (r.status === 'blocked' || r.status === 'pending_teacher') stat.blocked += 1;
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

        // A late joiner has nothing to explain, so they are neither explained
        // nor unexplained. Counting them either way would misreport the cohort.
        if (i.kind !== 'late_joiner') {
          if (i.reason_code) explainedTotal += 1;
          else unexplainedTotal += 1;
        }

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
          // The words the student actually typed. Selected but never returned
          // before, which is why no screen has ever been able to show them.
          reason_note: i.reason_note ?? null,
          reason_submitted_at: i.reason_submitted_at ?? null,
          reason_source: i.reason_source ?? null,
          followup_sent_at: i.followup_sent_at ?? null,
          caught_up_at: i.caught_up_at ?? null,
          excuse_note: i.excuse_note ?? null,
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

      const user = userById.get(studentId);
      const studentCard = {
        id: studentId,
        name: user?.name ?? null,
        email: user?.email ?? null,
        phone: user?.phone ?? null,
        avatar_url: user?.avatar_url ?? null,
      };

      // ── The two feeds that read across students ──────────────────────────
      // Built here rather than in a second pass so the resolved status a
      // student's row already carries travels with the reason, and the Reasons
      // tab can say "explained, and still has not started" in one row.
      for (const item of shaped) {
        if (item.reason_submitted_at) {
          reasons.push({ student: studentCard, ...item });
        }
        if (item.caught_up_at && String(item.caught_up_at).slice(0, 10) >= completedSince) {
          completed.push({ student: studentCard, ...item });
        }
      }

      const openCount = missedTotals.open + (totals.total - totals.completed);
      outstandingTotal += openCount;

      // A student with nothing left is not a work item, so they stay out of the
      // chase list rather than padding it with rows that read as green noise.
      // They are NOT dropped from the payload any more: their finished items are
      // already in `completed`, which is how the Caught up tab can answer "who
      // actually made it up" instead of showing an empty screen.
      if (openCount === 0) continue;

      students.push({
        journey_id: journey?.id ?? null,
        student: studentCard,
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

    // Every recent past class, not only the ones somebody missed. A class with
    // full attendance can still owe a recap, and the teacher who has to publish
    // it should not have to visit a second screen to find that out. This is the
    // list that replaced /teacher/class-recaps.
    const classStats = recentPast
      .map((c: any) => {
        const s = classStat.get(c.id) || { missed: 0, caughtUp: 0, outstanding: 0, blocked: 0 };
        const recap = recapByClass.get(c.id);
        return {
          id: c.id,
          title: c.title,
          scheduled_date: c.scheduled_date,
          ...s,
          present: presentByClass.get(c.id) || 0,
          recap_state: recapStateFor(c, recap),
          recap_id: recap?.id ?? null,
          has_transcript: !!c.transcript_url,
          teams_meeting_id: c.teams_meeting_id ?? null,
        };
      })
      .sort(
        (a: any, b: any) =>
          b.blocked - a.blocked ||
          b.outstanding - a.outstanding ||
          String(b.scheduled_date).localeCompare(String(a.scheduled_date)),
      );

    // Newest first: both feeds are read as "what happened lately".
    reasons.sort((a, b) => String(b.reason_submitted_at).localeCompare(String(a.reason_submitted_at)));
    completed.sort((a, b) => String(b.caught_up_at).localeCompare(String(a.caught_up_at)));

    return NextResponse.json({
      classroomId,
      students,
      classes,
      classStats,
      reasons: reasons.slice(0, MAX_REASONS),
      reasonTally: tallyReasons(reasons),
      completed,
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
        explained: explainedTotal,
        unexplained: unexplainedTotal,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the catch-up overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
