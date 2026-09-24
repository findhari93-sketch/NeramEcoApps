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
import { catchupStanding } from '@/lib/catchup-standing';
import { celebrationInfo, latestCelebrationByStudent } from '@/lib/catchup-celebration';
import { loadClassFactsForStudents } from '@/lib/catchup-facts';
import { computeCatchupPace } from '@/lib/catchup-pace';
import { loadReasonContext, resolveFromContext } from '@/lib/absence-reason-load';
import { describeReasonSource } from '@/lib/absence-reason';
import { activityKey, loadCatchupActivity } from '@/lib/catchup-activity';
import {
  describeItemProgress,
  diagnoseStudent,
  emptyDiagnosisTally,
  DIAGNOSIS_ORDER,
  type DiagItem,
} from '@/lib/catchup-diagnosis';

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

/*
 * The per-class view (every class, month by month, with its recap state) moved
 * to /api/catchup/calendar in the 2026-10 redesign. It used to ride on this
 * payload capped at the 60 most recent classes, which is exactly why finding
 * "the class on 11 Sept" meant scrolling an endless list.
 */

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
        reasonTally: { unwell: 0, family: 0, clash: 0, other: 0, none: 0 },
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
          byDiagnosis: emptyDiagnosisTally(),
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

    // A cancelled class asks nobody for anything. The class list below filters
    // on exactly this, so without the same rule here one screen showed a
    // cancelled class gone from "Classes and recaps" while its obligations were
    // still being counted on "Needs action", which is the same screen telling a
    // teacher two different things.
    const allItems = (rows || []).filter(
      (r: any) => r.class && r.class.status !== 'cancelled',
    );

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

    const [{ data: journeys }, reasonCtx] = await Promise.all([
      supabase
        .from('nexus_catchup_journeys')
        .select('id, student_id, started_on, weekly_quota, status')
        .eq('classroom_id', classroomId),
      // Whatever each student told us about each class, wherever they said it:
      // the RSVP, an away window, or the catch-up screen. See absence-reason.ts.
      loadReasonContext(
        supabase,
        items.map((i: any) => ({
          student_id: i.student_id,
          scheduled_class_id: i.scheduled_class_id,
          scheduled_date: i.class?.scheduled_date ?? null,
          reason_code: i.reason_code,
          reason_note: i.reason_note,
          reason_submitted_at: i.reason_submitted_at,
          reason_source: i.reason_source,
        })),
      ),
    ]);

    const today = istTodayYmd();

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

    const students: any[] = [];
    const reasonTally = { unwell: 0, family: 0, clash: 0, other: 0, none: 0 };
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

    // How each student is actually working through each recap: how far in, on
    // how many days, which checkpoint keeps beating them. Explanation only, so
    // it rides beside the facts rather than inside the rules. The class-level
    // facts (recaps, tests) are the same maps for every student.
    const anyFacts = factsByStudent.values().next().value as any;
    const activity = await loadCatchupActivity(supabase, {
      recapIds: anyFacts ? [...anyFacts.recapByClass.values()].map((r: any) => r.id as string) : [],
      testIds: anyFacts
        ? ([...new Set([...anyFacts.testByClass.values()].map((t: any) => t.test_id as string))] as string[])
        : [],
      studentIds: [...byStudent.keys()],
    });

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
        const reason =
          i.kind === 'late_joiner'
            ? null
            : resolveFromContext(reasonCtx, {
                student_id: studentId,
                scheduled_class_id: i.scheduled_class_id,
                scheduled_date: i.class.scheduled_date,
                reason_code: i.reason_code,
                reason_note: i.reason_note,
                reason_submitted_at: i.reason_submitted_at,
                reason_source: i.reason_source,
              });
        if (i.kind !== 'late_joiner') {
          if (reason) explainedTotal += 1;
          else unexplainedTotal += 1;
          // The reason filter counts classes still owed, which is what a
          // teacher filters on to act. Cleared and excused ones are history.
          if (r.status !== 'done' && r.status !== 'excused') {
            reasonTally[reason ? reason.code : 'none'] += 1;
          }
        }

        const recapId = facts.recapByClass.get(i.scheduled_class_id)?.id;
        const test = facts.testByClass.get(i.scheduled_class_id);
        const act = recapId ? activity.recap.get(activityKey(recapId, studentId)) ?? null : null;
        const testAct = test ? activity.test.get(activityKey(test.test_id, studentId)) ?? null : null;
        const watched = recapId ? facts.completedRecaps.has(recapId) : !!i.recording_watched_at;
        const testPassed = !!test?.passed || !!i.test_passed_at;
        const diag: DiagItem = {
          id: i.id,
          status: r.status,
          active: r.active,
          overdue: r.overdue,
          days_left: r.daysLeft,
          activated_on: i.activated_on ?? null,
          watched,
          assignments_outstanding: work.filter((a: any) => !facts.submitted.has(a.id)).length,
          // An optional class test blocks nothing, so it is not "work left".
          has_test: !!test && test.required !== false,
          test_passed: testPassed,
          title: i.class.title,
          scheduled_date: String(i.class.scheduled_date),
          activity: act,
          test: testAct,
        };

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
          /**
           * The one reason, wherever it was given (RSVP, away window, here),
           * with where it came from in words. Null when nobody has said.
           */
          reason: reason
            ? { code: reason.code, note: reason.note, source: reason.source, said: describeReasonSource(reason) }
            : null,
          activated_on: i.activated_on ?? null,
          /** "40% watched, 2 sittings, last active 5 days ago". */
          progress: describeItemProgress(diag, today),
          followup_sent_at: i.followup_sent_at ?? null,
          caught_up_at: i.caught_up_at ?? null,
          excuse_note: i.excuse_note ?? null,
          watched,
          assignments_outstanding: diag.assignments_outstanding,
          assignments_total: work.length,
          has_test: !!test,
          test_passed: testPassed,
          excused: !!i.excused_at,
          class: {
            title: i.class.title,
            scheduled_date: i.class.scheduled_date,
          },
          _diag: diag,
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

      // A student with nothing left used to be dropped here, on the grounds that
      // they are not a work item. That was true of the chase list and wrong of
      // the payload: it meant the one group worth congratulating was the only
      // group the screen deleted, and there was no way anywhere in Nexus to ask
      // "who is completely clear". They now stay, carrying `bucket: 'all_clear'`,
      // which keeps them out of the chase groups (those iterate BUCKET_ORDER,
      // and all_clear is deliberately not in it) while making them countable.
      const standing = catchupStanding(
        studentItems.map((i: any, idx: number) => ({
          kind: i.kind ?? null,
          status: resolved[idx].status,
          scheduledDate: String(i.class.scheduled_date),
          caughtUpAt: i.caught_up_at ?? null,
          followupSentAt: i.followup_sent_at ?? null,
          recordingWatchedAt: i.recording_watched_at ?? null,
          activatedOn: i.activated_on ?? null,
        })),
        today,
      );

      const diagnosis = diagnoseStudent({
        items: shaped.map((x: any) => x._diag),
        openCount,
        blockedOnUs,
        today,
        pace: journey ? pace : null,
      });
      for (const x of shaped) delete (x as any)._diag;

      students.push({
        journey_id: journey?.id ?? null,
        student: studentCard,
        /** Why, in one sentence. The page's tiles and filters read `diagnosis.state`. */
        diagnosis,
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
        standing,
        items: shaped,
      });
    }

    // ── Who has already been congratulated ──────────────────────────────────
    // One read, scoped to the students who are clear right now, because the
    // wall is the only thing that asks. A failed read is reported rather than
    // swallowed into "nobody was congratulated": that answer pre-selects the
    // whole wall, and a missing table on a drifted environment would then
    // re-post every student the teacher already named.
    let celebrationsUnavailable = false;
    const clearIds = students.filter((s) => s.bucket === 'all_clear').map((s) => s.student.id);
    if (clearIds.length > 0) {
      const { data: celebrationRows, error: celebrationError } = await supabase
        .from('nexus_catchup_celebrations')
        .select('id, student_id, source, last_cleared_at, celebrated_at')
        .eq('classroom_id', classroomId)
        .in('student_id', clearIds);
      if (celebrationError) {
        celebrationsUnavailable = true;
        console.error('[catchup/overview] could not read celebrations', celebrationError);
      } else {
        const byStudent = latestCelebrationByStudent(celebrationRows || []);
        for (const s of students) {
          if (s.bucket !== 'all_clear') continue;
          s.celebration = celebrationInfo(s.standing.lastClearedAt, byStudent.get(s.student.id));
        }
      }
    }

    // Sorted as a work queue, not a register. Bucket leads so the client can
    // group by simply walking the array, and the tie-breaks then order the rows
    // within a group: whoever owes the most, first.
    //
    // `all_clear` is not in BUCKET_ORDER, so indexOf returns -1 for it and the
    // finished students would float to the very top of a chase queue. Ranking
    // them explicitly last is what keeps the work at the top of the array.
    const diagRank = (d: string) => DIAGNOSIS_ORDER.indexOf(d as (typeof DIAGNOSIS_ORDER)[number]);
    const chaseRank = (b: (typeof students)[number]['bucket']) => {
      const i = BUCKET_ORDER.indexOf(b);
      return i === -1 ? BUCKET_ORDER.length : i;
    };
    students.sort(
      (a, b) =>
        diagRank(a.diagnosis.state) - diagRank(b.diagnosis.state) ||
        chaseRank(a.bucket) - chaseRank(b.bucket) ||
        b.pace.deficit - a.pace.deficit ||
        b.openCount - a.openCount ||
        b.missedTotals.open - a.missedTotals.open,
    );

    const classes = [...classColumns.values()].sort((a, b) =>
      String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
    );

    return NextResponse.json({
      classroomId,
      students,
      classes,
      /** Classes still owed, per reason category, plus 'none' for unexplained. */
      reasonTally,
      noRecording: [...noRecording.values()].sort((a, b) =>
        String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
      ),
      pendingRecap: [...pendingRecap.values()].sort((a, b) =>
        String(a.scheduled_date).localeCompare(String(b.scheduled_date)),
      ),
      celebrationsUnavailable,
      totals: {
        // A count of the buckets on the rows above, and the only thing the tiles
        // read. studentsBehind used to be computed here with its own predicate,
        // which omitted `stalled` while the list under it included it, so the
        // headline and the rows it summarised disagreed. There is one rule now.
        byBucket: tallyBuckets(students.map((s) => s.bucket)),
        byDiagnosis: students.reduce((t, s) => {
          t[s.diagnosis.state as keyof typeof t] += 1;
          return t;
        }, emptyDiagnosisTally()),
        hiddenDormant,
        // Kept for anything still reading the old shape. Derived from the same
        // tally rather than recomputed, so they cannot drift back apart.
        //
        // All three exclude `all_clear` explicitly. Finished students used to be
        // absent from `students` altogether, so every one of these counted them
        // out for free; now that they stay in the payload, the omission has to be
        // written down or the sub-line jumps from "across 27 students" to "across
        // 29" on the day this ships, describing the same cohort.
        studentsBehind: students.filter(
          (s) =>
            s.bucket !== 'in_progress' && s.bucket !== 'waiting_on_us' && s.bucket !== 'all_clear',
        ).length,
        studentsStalled: students.filter((s) => s.bucket === 'not_started').length,
        studentsCatchingUp: students.filter((s) => s.bucket !== 'all_clear').length,
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
