import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  istTodayYmd,
  loadClassroomRoster,
  readCatchupWindows,
  resolveCatchupBacklog,
  toFacts,
} from '@neram/database';
import { loadClassFactsForStudents } from '@/lib/catchup-facts';
import { turnaround } from '@/lib/catchup-turnaround';
import { describeReason, tallyReasons } from '@/lib/rsvp-reasons';
import { ATTENDANCE_FAILURE_MESSAGES, type AttendanceSyncFailure } from '@/lib/attendance-sync';
import {
  barelyAttendedCutoff,
  bucketFor,
  joinedAfterClass,
  scheduledMinutes as spanMinutes,
  tallyBuckets,
} from '@/lib/attendance-quality';
import {
  attendanceFlags,
  presenceOf,
  registerGroupOf,
  sessionWindow,
} from '@/lib/attendance-register';
import { describeReasonSource, reasonLine, resolveAbsenceReason } from '@/lib/absence-reason';
import { activityKey, loadCatchupActivity, type CatchupActivity } from '@/lib/catchup-activity';
import { STUCK_FAILS, daysBetween, describeItemProgress, type DiagItem } from '@/lib/catchup-diagnosis';
import {
  MISSED_STATES,
  daysToCatchUp,
  followupState,
  medianOf,
  tallyFollowup,
  type FollowupState,
} from '@/lib/class-followup';
import { loadClassWork, studentWork, summariseWork, type WorkAudience } from '@/lib/class-work';
import { loadRecentAttendance, type RecentAttendance } from '@/lib/recent-attendance';
import {
  AWAY_COLUMNS,
  coveringWindow,
  describeWindow,
  groupByStudent,
  type AwayWindow,
} from '@/lib/away-windows';

/**
 * GET /api/timetable/class-insights?class_id={id}&classroom_id={id}  (teacher)
 *
 * Everything about one class's attendance, in one request.
 *
 * Three things reconciled per student: the RSVP (who was expected, on a
 * default-attending model), the Teams register (who came, how long, late / left
 * early / dropped mid-class), and the absence row (why they were away and how
 * far they have got with making it up). Read-only; the teacher pulls fresh
 * attendance with "Sync from Teams" first.
 *
 * The absence join is the recent addition and it is what lets this one route
 * drive the whole attendance panel. Before it, the panel needed this route for
 * the durations AND attendance-report for the reasons, fetched both on open,
 * and the two answers could disagree. attendance-report is now the lazy second
 * request, opened only when a teacher goes to repair the register.
 */
/** The resolved reason in the shape the panel reads. */
function reasonFor(abs: any, opt: any, awayWindows: AwayWindow[], classDate: string) {
  const resolved = resolveAbsenceReason({ absence: abs, rsvp: opt ?? null, awayWindows, classDate });
  if (!resolved) return null;
  return {
    code: resolved.code,
    note: resolved.note,
    source: resolved.source,
    said: describeReasonSource(resolved),
    at: resolved.at,
    unspecified: !!resolved.unspecified,
    line: reasonLine(resolved),
  };
}

/** Who owes the class's homework, split by where they stand on the class. */
function workAudience(state: FollowupState): WorkAudience {
  if (state === 'attended' || state === 'partly') return 'came';
  if (state === 'caught_up' || state === 'caught_up_silent') return 'caught_up';
  if (state === 'needs_call' || state === 'catching_up' || state === 'late_joiner' || state === 'waiting_on_us') {
    return 'catching_up';
  }
  return 'other';
}

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classId = request.nextUrl.searchParams.get('class_id');
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    if (!classId || !classroomId) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Staff gate on user_type, not classroom enrollment: any teacher or admin can
    // review any class, matching /api/timetable/attendance-report.
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Only teachers can view class insights' }, { status: 403 });
    }

    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        'id, title, scheduled_date, start_time, end_time, classroom_id, status, attendance_synced_at, ' +
          // recording_url and youtube_url are read by classifyCatchupCandidate
          // inside toFacts: a class with neither is one nobody can catch up on,
          // and saying "not started" about it would blame a student for our gap.
          'attendance_sync_status, teams_meeting_id, recording_url, youtube_url',
      )
      .eq('id', classId)
      .eq('classroom_id', classroomId)
      .single();
    if (!cls) return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });

    // Dormant students are excluded, so the attendance rate on this panel counts
    // only the students who are actually expected in the room.
    const [{ members }, { data: attendance }, { data: optOuts }, { data: absenceRows }, { data: awayRows }] =
      await Promise.all([
        // `phone` is not in the roster's base columns, and it is asked for here
        // so a teacher can ring somebody straight off the missed list instead of
        // opening the student page for a number. Staff-only route.
        loadClassroomRoster(classroomId, { userColumns: 'phone', client: supabase }),
        supabase
          .from('nexus_attendance')
          .select('student_id, attended, joined_at, left_at, duration_minutes, attendance_intervals')
          .eq('scheduled_class_id', classId),
        supabase
          .from('nexus_class_rsvp')
          .select('student_id, response, reason, reason_code, responded_at')
          .eq('scheduled_class_id', classId)
          .eq('response', 'not_attending'),
        // Why each absent student was away, how far they have got with making it
        // up, and whether anyone has already chased them. `id` is what makes the
        // row actionable: /api/catchup/items/[id] takes excuse / restore /
        // reset_test against it, and the nudge stamps followup_sent_at on it.
        supabase
          .from('nexus_class_absences')
          .select(
            'id, student_id, kind, reason_code, reason_note, reason_source, reason_submitted_at, ' +
              'recording_watched_at, caught_up_at, excused_at, followup_sent_at, ' +
              // The clock. Without these the panel could say what a student had
              // done but not whether they were inside their window, which is the
              // half of the question a teacher reviewing a class actually asks.
              'activated_on, days_used, test_passed_at',
          )
          .eq('scheduled_class_id', classId),
        // Declared away windows covering the day this class ran. Read live
        // rather than taken from a flag on the absence row, so a class moved
        // into or out of a window gets the current answer. The register endpoint
        // reads the same table the same way, which is what stops this screen and
        // that one describing the same night differently.
        supabase
          .from('nexus_student_away_windows')
          .select(AWAY_COLUMNS)
          .is('cancelled_at', null)
          .lte('starts_on', cls.scheduled_date)
          .or(`ends_on.is.null,ends_on.gte.${cls.scheduled_date}`),
      ]);

    const awayByStudent = groupByStudent((awayRows || []) as AwayWindow[]);

    // Whether Teams attendance has been read for this class at all, the same
    // test the register endpoint uses. A class with zero attendance rows has
    // nothing to say about any student, and without this the class screen
    // computed a group for every roster member anyway (everyone `attended:
    // false`, defaulting most of them into "missed, no reason"), rendering a
    // class that simply had not synced yet as its whole roster missing.
    const measured = (attendance || []).length > 0;

    // How long the class was booked for, and how long it actually ran. The
    // second is what every flag below is measured against.
    const held = sessionWindow(cls, attendance || []);
    const lengthMinutes = spanMinutes(cls.start_time, cls.end_time);
    const barelyCutoff = barelyAttendedCutoff(held.minutes);

    const attById = new Map<string, any>((attendance || []).map((a: any) => [a.student_id, a]));
    const optById = new Map<string, any>((optOuts || []).map((o: any) => [o.student_id, o]));
    const absenceById = new Map<string, any>(
      (absenceRows || []).map((a: any) => [a.student_id, a]),
    );

    // ── How far each absent student has actually got ────────────────────────
    //
    // The panel used to read `recording_watched_at` straight off the row, which
    // is wrong in one direction that matters: a student who completed the gated
    // recap has no such stamp (the mark_watched action refuses while a published
    // recap exists), so the one who did the harder thing read as "Recording not
    // watched" to their teacher. `toFacts` resolves it the same way the student's
    // own screen and /api/catchup/overview do, so all three now agree.
    //
    // Six queries over a single class id, whatever the size of the cohort.
    const classIdsByStudent = new Map<string, string[]>(
      (absenceRows || []).map((a: any) => [a.student_id as string, [classId]]),
    );
    const [catchupFacts, windows] = await Promise.all([
      classIdsByStudent.size
        ? loadClassFactsForStudents(supabase, classIdsByStudent)
        : Promise.resolve(new Map()),
      readCatchupWindows(supabase, classroomId),
    ]);
    const today = istTodayYmd();

    // ── The texture behind "not caught up", the class's homework, and how
    // each missed student has been turning up lately ─────────────────────────
    //
    // All three explain rather than decide, so each degrades to "unknown"
    // instead of failing the panel: a teacher can still act on who missed the
    // class without knowing how far into the recap they got.
    const anyFacts: any = [...catchupFacts.values()][0] ?? null;
    const recapId: string | null = anyFacts?.recapByClass?.get(classId)?.id ?? null;
    const anyTest: any = anyFacts?.testByClass?.get(classId) ?? null;
    const missedIds: string[] = members
      .filter((m: any) => !attById.get(m.user_id)?.attended)
      .map((m: any) => m.user_id as string);
    const enrolledAt = new Map<string, string | null>(
      members.map((m: any) => [m.user_id as string, (m.enrolled_at as string | null) ?? null]),
    );
    const [activity, classWork, recent] = await Promise.all([
      classIdsByStudent.size
        ? loadCatchupActivity(supabase, {
            recapIds: recapId ? [recapId] : [],
            testIds: anyTest?.test_id ? [anyTest.test_id] : [],
            studentIds: [...classIdsByStudent.keys()],
          }).catch(() => null as CatchupActivity | null)
        : Promise.resolve(null as CatchupActivity | null),
      loadClassWork(supabase, classId).catch(() => ({ assignments: [], subs: new Map() })),
      measured && missedIds.length
        ? loadRecentAttendance(supabase, {
            classroomId,
            uptoDate: cls.scheduled_date,
            studentIds: missedIds,
            enrolledAt,
          }).catch(() => new Map<string, RecentAttendance>())
        : Promise.resolve(new Map<string, RecentAttendance>()),
    ]);

    /** The one resolved item for this student and this class, or null. */
    const catchupFor = (studentId: string, abs: any) => {
      const facts = catchupFacts.get(studentId);
      if (!abs || !facts) return null;
      const item = { ...abs, scheduled_class_id: classId, class: cls };
      const facts0 = toFacts(item, facts);
      const resolved = resolveCatchupBacklog([facts0], { today, windows })[0];
      if (!resolved) return null;
      const test: any = facts.testByClass?.get(classId) ?? null;
      const act = recapId ? activity?.recap.get(activityKey(recapId, studentId)) ?? null : null;
      const testAct = test ? activity?.test.get(activityKey(test.test_id, studentId)) ?? null : null;
      const work: any[] = facts.assignmentsByClass?.get(classId) || [];
      const diag: DiagItem = {
        id: abs.id,
        status: resolved.status,
        active: resolved.active,
        overdue: resolved.overdue,
        days_left: resolved.daysLeft,
        activated_on: abs.activated_on ?? null,
        watched: facts0.watched,
        assignments_outstanding: work.filter((a: any) => !facts.submitted?.has(a.id)).length,
        has_test: !!test && test.required !== false,
        test_passed: !!facts0.testPassed,
        title: cls.title,
        scheduled_date: String(cls.scheduled_date),
        activity: act,
        test: testAct,
      };
      return {
        /**
         * "40% watched, 2 sittings, last active 5 days ago": the same words the
         * catch-up page's student sheet uses, from lib/catchup-diagnosis.ts.
         */
        progress: describeItemProgress(diag, today),
        /** A checkpoint has beaten them twice in a row: a reminder will not help. */
        stuck: (act?.checkpoint?.fails ?? 0) >= STUCK_FAILS,
        last_active_at: act?.lastActiveAt ?? null,
        status: resolved.status,
        step: resolved.step,
        /** Resolved, not the raw column. See the note above. */
        watched: facts0.watched,
        due_on: resolved.dueOn,
        days_left: resolved.daysLeft,
        overdue: resolved.overdue,
        active: resolved.active,
        window_days: resolved.windowDays,
        /**
         * "the next day", "28 days later". Computed here rather than in the
         * browser so this panel and the standing tab print the same sentence
         * about the same class. See lib/catchup-turnaround.ts.
         */
        cleared_after: turnaround(cls.scheduled_date, abs.caught_up_at ?? null) || null,
      };
    };

    const students = members.map((r: any) => {
      const a = attById.get(r.user_id);
      const opt = optById.get(r.user_id);
      const abs = absenceById.get(r.user_id) ?? null;
      const awayWindow = coveringWindow(awayByStudent.get(r.user_id) || [], cls.scheduled_date);
      const attended = !!a?.attended;
      const presence = presenceOf(a || {}, held);
      const flags = attendanceFlags(presence);
      const durationMinutes = a?.duration_minutes ?? null;
      const row = {
        id: r.user_id,
        name: r.user?.name || 'Student',
        avatar_url: r.user?.avatar_url || null,
        // Carried so the teacher can ring somebody straight off the missed list
        // rather than going to the student page for a number.
        phone: r.user?.phone || null,
        // The classification, carried so every avatar on this panel can wear the
        // info ring. It costs nothing: the roster already selects both columns.
        study_stage: r.current_standard ?? null,
        dormant: r.participation_status === 'dormant',
        enrolled_at: r.enrolled_at ?? null,
        // Enrolled after this class ran, so there was never anything for them to
        // explain. Read by bucketFor below, which is why it is set before it.
        joinedAfterClass: joinedAfterClass(r.enrolled_at, cls.scheduled_date),
        // A declared away window covers this class's date. Same reasoning: read
        // by bucketFor below, so it is set before it.
        away: !!awayWindow,
        // Described against the class's own date, not today, so a class reviewed
        // in December still reads "Away until 20 Oct" rather than describing a
        // window that has long since closed as if it were upcoming.
        away_window: awayWindow
          ? `${describeWindow(awayWindow, cls.scheduled_date)}: ${describeReason(
              awayWindow.reason_code,
              awayWindow.reason_note,
            )}`
          : null,
        rsvp: opt ? 'not_attending' : 'attending',
        reason: opt ? (opt.reason_code || opt.reason || null) : null,
        attended,
        joined_at: a?.joined_at || null,
        left_at: a?.left_at || null,
        duration_minutes: durationMinutes,
        joinedLate: attended && flags.joinedLate,
        leftEarly: attended && flags.leftEarly,
        droppedMidClass: attended && flags.droppedMidClass,
        barelyAttended: attended && flags.barelyAttended,
        minutesIn: attended ? presence.minutesIn : 0,
        lateByMin: presence.lateByMin,
        leftEarlyByMin: presence.leftEarlyByMin,
        outMin: presence.outMin,
        segments: presence.segments.map((s) => ({
          start: new Date(s.startMs).toISOString(),
          end: new Date(s.endMs).toISOString(),
        })),
        absence: abs
          ? {
              id: abs.id,
              kind: abs.kind ?? null,
              reason_code: abs.reason_code ?? null,
              reason_note: abs.reason_note ?? null,
              reason_source: abs.reason_source ?? null,
              reason_submitted_at: abs.reason_submitted_at ?? null,
              recording_watched_at: abs.recording_watched_at ?? null,
              caught_up_at: abs.caught_up_at ?? null,
              excused_at: abs.excused_at ?? null,
              followup_sent_at: abs.followup_sent_at ?? null,
            }
          : null,
        catchup: catchupFor(r.user_id, abs),
        /**
         * Why they missed it, from wherever they said it: an away window, the
         * RSVP decline, or afterwards on the catch-up screen. The panel used to
         * read only the last, so everyone on declared leave sat under "Told us
         * why" with the words "No reason given" beside their name.
         */
        reason_resolved: attended ? null : reasonFor(abs, opt, awayByStudent.get(r.user_id) || [], cls.scheduled_date),
        days_since_class: Math.max(0, daysBetween(String(cls.scheduled_date), today)),
        days_to_catch_up: daysToCatchUp(String(cls.scheduled_date), abs?.caught_up_at ?? null),
        recent: recent.get(r.user_id) ?? null,
        work: classWork.assignments.length ? studentWork(r.user_id, classWork.assignments, classWork.subs) : null,
      };
      const followup: FollowupState = followupState({
        attended,
        partly: attended && (flags.joinedLate || flags.leftEarly || flags.droppedMidClass || flags.barelyAttended),
        measured,
        joinedAfterClass: row.joinedAfterClass,
        hasReason: !!row.reason_resolved,
        hasAbsence: !!abs,
        excused: !!abs?.excused_at,
        caughtUp: !!abs?.caught_up_at,
        catchupStatus: row.catchup?.status ?? null,
      });
      return {
        ...row,
        followup,
        bucket: bucketFor(row),
        group: registerGroupOf({
          attended,
          presence,
          joinedAfterClass: row.joinedAfterClass,
          away: row.away,
          rsvp: row.rsvp,
          absence: row.absence,
        }),
      };
    });

    const rosterSize = students.length;
    const present = students.filter((s: any) => s.attended).length;
    const durations = students.filter((s: any) => s.attended && s.duration_minutes != null).map((s: any) => s.duration_minutes);
    const avgDuration = durations.length ? Math.round(durations.reduce((x: number, y: number) => x + y, 0) / durations.length) : 0;

    // The seven states, counted once each. Named stateTally only because `buckets`
    // below is the older RSVP-vs-actual matrix, which answers a different
    // question (did the RSVP predict the room) and is still shown.
    const stateTally = tallyBuckets(students);

    // The class in one picture: who came, and for everyone who did not, which
    // corner of told-us-why by caught-up they are in.
    const followupTally = tallyFollowup(students.map((s: any) => s.followup as FollowupState));
    const work = summariseWork(
      classWork.assignments,
      students.map((s: any) => ({
        id: s.id,
        audience: workAudience(s.followup),
        work: s.work,
        joinedAfterClass: s.joinedAfterClass,
      })),
    );
    const openDays: number[] = students
      .filter((s: any) => s.followup === 'needs_call' || s.followup === 'catching_up')
      .map((s: any) => s.days_since_class as number);
    const clearDays: number[] = students
      .map((s: any) => s.days_to_catch_up as number | null)
      .filter((d: number | null): d is number => d != null);

    // RSVP (expected) vs actual, the core comparison.
    const buckets = {
      attendingAttended: students.filter((s: any) => s.rsvp === 'attending' && s.attended).length,
      attendingAbsent: students.filter((s: any) => s.rsvp === 'attending' && !s.attended).length,
      declinedAbsent: students.filter((s: any) => s.rsvp === 'not_attending' && !s.attended).length,
      declinedAttended: students.filter((s: any) => s.rsvp === 'not_attending' && s.attended).length,
    };

    return NextResponse.json({
      class: {
        id: cls.id,
        title: cls.title,
        scheduled_date: cls.scheduled_date,
        start_time: cls.start_time,
        end_time: cls.end_time,
        status: cls.status,
        attendance_synced_at: cls.attendance_synced_at,
        attendance_sync_status: cls.attendance_sync_status ?? null,
        attendance_sync_message:
          cls.attendance_sync_status && cls.attendance_sync_status !== 'ok'
            ? ATTENDANCE_FAILURE_MESSAGES[cls.attendance_sync_status as AttendanceSyncFailure] ?? null
            : null,
        has_meeting: !!cls.teams_meeting_id,
        // The id itself, not just whether one exists: the class screen mounts
        // ClassAttendanceDialog, whose Sync button needs the real meeting id.
        teams_meeting_id: cls.teams_meeting_id ?? null,
        measured,
      },
      summary: {
        rosterSize,
        present,
        absent: rosterSize - present,
        attendanceRate: rosterSize ? Math.round((present / rosterSize) * 100) : 0,
        avgDuration,
        lateCount: students.filter((s: any) => s.joinedLate).length,
        leftEarlyCount: students.filter((s: any) => s.leftEarly).length,
        droppedCount: students.filter((s: any) => s.droppedMidClass).length,
        barelyAttendedCount: students.filter((s: any) => s.barelyAttended).length,
        // How long the class was meant to run, so the panel can say "6 min of
        // 90" rather than a bare number, and so it can explain the flag.
        scheduledMinutes: lengthMinutes,
        barelyAttendedCutoff: barelyCutoff,
        // When the class really ran, so the screen can say "held 7:00 to 8:10 PM
        // (booked to 8:30)" instead of measuring everyone against a time the
        // teacher never taught to.
        held: {
          start: new Date(held.startMs).toISOString(),
          end: new Date(held.endMs).toISOString(),
          source: held.source,
          minutes: held.minutes,
        },
        // The follow-up picture. missedNoReason is the number this whole panel
        // exists to make visible: away, silent, and nothing done about it.
        missedNoReason: stateTally.missed_no_reason,
        missedWithReason: stateTally.missed_with_reason,
        caughtUp: stateTally.caught_up,
        excused: stateTally.excused,
        // Enrolled after the class ran. Counted in notCaughtUp because the work
        // is genuinely still owed, but held apart everywhere it is labelled: a
        // late joiner needs the recording, not a phone call asking where they were.
        lateJoiners: stateTally.late_joiner,
        // Missed because they told us in advance they would be away for a
        // stretch. Held apart from missedWithReason for the same reason late
        // joiners are held apart: the number is actionable in a different way.
        // A fortnight of declared exam leave is not eight separate incidents.
        away: stateTally.away,
        // Away is counted here, exactly like late joiners and for the same
        // reason: the work is genuinely still owed. Declaring a window explains
        // the empty seat, it does not cancel the class or the catch-up behind it.
        notCaughtUp:
          stateTally.missed_no_reason +
          stateTally.missed_with_reason +
          stateTally.away +
          stateTally.late_joiner,
      },
      followup: {
        tally: followupTally,
        missed: students.filter((s: any) => MISSED_STATES.has(s.followup)).length,
        oldestOpenDays: openDays.length ? Math.max(...openDays) : null,
        medianDaysToCatchUp: medianOf(clearDays),
        // Expected to come, against who did. On the default-attending model that
        // is the roll minus the declines, the away and the late joiners.
        saidComing: students.filter(
          (s: any) => s.rsvp === 'attending' && !s.away && !s.joinedAfterClass,
        ).length,
      },
      work,
      buckets,
      reasonTally: tallyReasons(optOuts || []),
      students,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load class insights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
