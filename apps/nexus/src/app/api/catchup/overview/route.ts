import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  toFacts,
  resolveCatchupBacklog,
  summariseCatchupClock,
  readCatchupWindows,
  summariseCatchupBacklog,
  summariseMissedClasses,
  missedClassDueOn,
  isOverdue,
  istTodayYmd,
  loadClassroomRoster,
  isTracked,
} from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { BUCKET_ORDER, catchupBucket, emptyTally, tallyBuckets } from '@/lib/catchup-buckets';
import { loadClassFactsForStudents } from '@/lib/catchup-facts';
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
          byBucket: emptyTally(),
          hiddenDormant: 0,
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
          'activated_on, days_used, ' +
          'class:nexus_scheduled_classes(id, title, scheduled_date, start_time, status, ' +
          'recording_url, youtube_url)',
      )
      .eq('classroom_id', classroomId)
      .limit(MAX_ITEMS);

    const allItems = (rows || []).filter((r: any) => r.class);

    // ── Who counts towards this classroom's numbers ─────────────────────────
    //
    // This screen was the last monitoring surface in Nexus reading absence rows
    // straight off the table, so it never applied the roster rule. Writing
    // absences already gets it right (lib/class-absences.ts loads the roster,
    // which drops dormant students by default), but every row written BEFORE a
    // student went quiet stayed here forever, in the list and in all four
    // headline numbers. Removed enrolments and graduated alumni leaked the same
    // way.
    //
    // `includeDormant: true` then splitting on isTracked is deliberate: loading
    // them is the only way to say how many were hidden, and a student who
    // silently disappears reads as a bug. isTracked is the ONE written-down
    // definition of the predicate, so do not inline a participation_status check
    // here; that is exactly the drift the helper exists to end.
    const roster = await loadClassroomRoster<any>(classroomId, {
      includeDormant: true,
      userColumns: 'phone',
      client: supabase,
    });
    const trackedIds = new Set<string>();
    const untrackedIds = new Set<string>();
    for (const member of roster.members) {
      (isTracked(member) ? trackedIds : untrackedIds).add(member.user_id);
    }

    const items = allItems.filter((i: any) => trackedIds.has(i.student_id));

    // Only the ones who would otherwise have been on the screen. A dormant
    // student with nothing outstanding is not being hidden from anybody.
    const hiddenDormant = new Set(
      allItems
        .filter((i: any) => untrackedIds.has(i.student_id) && !i.caught_up_at && !i.excused_at)
        .map((i: any) => i.student_id as string),
    ).size;

    // Deliberately no early return on an empty absence list. A classroom where
    // nobody has missed anything can still owe recaps, and that is exactly what
    // the Classes and recaps tab exists to show.
    const classIds = [...new Set(items.map((i: any) => i.scheduled_class_id))] as string[];

    const [{ data: journeys }, { data: termClasses }] = await Promise.all([
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
            // student_id rides along so the present count can be held to the
            // same roster as the missed count beside it. Without it a dormant
            // student inflates "present" while being excluded from "missed",
            // and the two numbers on one row stop adding up.
            .select('scheduled_class_id, attended, student_id')
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

    // Straight off the roster embed, which already carries phone via
    // userColumns. The separate users select this replaces was a second read of
    // rows we now have in hand.
    const userById = new Map<string, any>(roster.members.map((m: any) => [m.user_id, m.user]));
    const journeyByStudent = new Map<string, any>(
      (journeys || []).map((j: any) => [j.student_id, j]),
    );

    // How long a student gets once they start something here. One row, read
    // live rather than snapshotted, so a teacher widening the window to help a
    // struggling cohort applies at once instead of at their next activation.
    const windows = await readCatchupWindows(supabase, classroomId);

    const presentByClass = new Map<string, number>();
    for (const a of attendance || []) {
      if (!a.attended) continue;
      if (!trackedIds.has(a.student_id)) continue;
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

    // Every student's facts in one batch, before the loop rather than inside it.
    // Doing this per student was six queries each, in series, so a class of forty cost
    // eighty round trips before anything rendered. See lib/catchup-facts.ts.
    const factsByStudent = await loadClassFactsForStudents(
      supabase,
      new Map(
        [...byStudent].map(([studentId, studentItems]) => [
          studentId,
          studentItems.map((i: any) => i.scheduled_class_id),
        ]),
      ),
    );

    for (const [studentId, studentItems] of byStudent) {
      studentItems.sort((a: any, b: any) => {
        const d = String(a.class.scheduled_date).localeCompare(String(b.class.scheduled_date));
        if (d !== 0) return d;
        return String(a.class.start_time || '').localeCompare(String(b.class.start_time || ''));
      });

      const facts = factsByStudent.get(studentId)!;
      // Deadlines come off each student's own clock now. The item they started
      // carries one; everything else carries none, which is why there is no
      // longer a per-item due-date pass here.
      const resolved = resolveCatchupBacklog(
        studentItems.map((i: any) => toFacts(i, facts)),
        { today, windows },
      );

      const totals = summariseCatchupBacklog(resolved);
      const missedTotals = summariseMissedClasses(resolved);
      // "How many are overdue" can only be 0 or 1 now, so it stopped being a
      // magnitude a teacher can sort by. `stalled` replaces it: work owed and
      // nothing running on any of it, which is the student who opened the list
      // and closed it again.
      const clockSummary = summariseCatchupClock(resolved);

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
          // Null on everything except the one class this student started.
          due_on: r.dueOn,
          overdue: r.overdue,
          active: r.active,
          days_left: r.daysLeft,
          recommended: r.recommended,
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

      // Work the student cannot move: no recording at all, or a recap nobody has
      // published. Counted off `resolved` rather than the two summaries because
      // neither of them reports it. summariseCatchupBacklog only looks at chained
      // items, and summariseMissedClasses skips these statuses outright, which is
      // why a student stuck entirely behind our own unpublished recap had an open
      // count of zero and fell through the `continue` below. They were not merely
      // sorted low on this screen, they were absent from it.
      const blockedOnUs = resolved.filter(
        (r) => r.status === 'blocked' || r.status === 'pending_teacher',
      ).length;

      // A student with nothing left is not a work item, so they stay out of the
      // chase list rather than padding it with rows that read as green noise.
      // They are NOT dropped from the payload: their finished items are already
      // in `completed`, which is how the Caught up tab can answer "who actually
      // made it up" instead of showing an empty screen.
      if (openCount === 0 && blockedOnUs === 0) continue;

      students.push({
        journey_id: journey?.id ?? null,
        student: studentCard,
        // Decided here, once, so the tile and the group under it are the same
        // number by construction. See lib/catchup-buckets.ts.
        bucket: catchupBucket({ openCount, blockedOnUs, clock: clockSummary, pace }),
        openCount,
        blockedOnUs,
        started_on: journey?.started_on ?? null,
        weekly_quota: journey?.weekly_quota ?? null,
        totals,
        missedTotals,
        clock: clockSummary,
        pace,
        items: shaped,
      });
    }

    // Sorted as a work queue, not a register. Bucket leads so the client can
    // group by simply walking the array, and the tie-breaks then order the rows
    // within a group: whoever owes the most, first.
    students.sort(
      (a, b) =>
        BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) ||
        b.pace.deficit - a.pace.deficit ||
        b.openCount - a.openCount ||
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
        // A count of the buckets on the rows above, and the only thing the tiles
        // read. studentsBehind used to be computed here with its own predicate,
        // which omitted `stalled` while the list under it included it, so the
        // headline and the rows it summarised disagreed. There is one rule now.
        byBucket: tallyBuckets(students.map((s) => s.bucket)),
        hiddenDormant,
        // Kept for anything still reading the old shape. Derived from the same
        // tally rather than recomputed, so they cannot drift back apart.
        studentsBehind: students.filter((s) => s.bucket !== 'in_progress' && s.bucket !== 'waiting_on_us')
          .length,
        studentsStalled: students.filter((s) => s.bucket === 'not_started').length,
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
