import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, loadClassroomRoster } from '@neram/database';
import { LATE_THRESHOLD_MINUTES } from '@/lib/class-absences';
import { tallyReasons } from '@/lib/rsvp-reasons';
import { ATTENDANCE_FAILURE_MESSAGES, type AttendanceSyncFailure } from '@/lib/attendance-sync';
import {
  barelyAttendedCutoff,
  bucketFor,
  scheduledMinutes as spanMinutes,
  tallyBuckets,
} from '@/lib/attendance-quality';

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
        'id, title, scheduled_date, start_time, end_time, classroom_id, status, attendance_synced_at, attendance_sync_status, teams_meeting_id',
      )
      .eq('id', classId)
      .eq('classroom_id', classroomId)
      .single();
    if (!cls) return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });

    // Dormant students are excluded, so the attendance rate on this panel counts
    // only the students who are actually expected in the room.
    const [{ members }, { data: attendance }, { data: optOuts }, { data: absenceRows }] =
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
          .select('student_id, reason, reason_code')
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
              'recording_watched_at, caught_up_at, excused_at, followup_sent_at',
          )
          .eq('scheduled_class_id', classId),
      ]);

    const startMs = new Date(`${cls.scheduled_date}T${cls.start_time}+05:30`).getTime();
    const endMs = new Date(`${cls.scheduled_date}T${cls.end_time}+05:30`).getTime();
    const graceMs = LATE_THRESHOLD_MINUTES * 60 * 1000;
    const lengthMinutes = spanMinutes(cls.start_time, cls.end_time);
    const barelyCutoff = barelyAttendedCutoff(lengthMinutes);

    const attById = new Map<string, any>((attendance || []).map((a: any) => [a.student_id, a]));
    const optById = new Map<string, any>((optOuts || []).map((o: any) => [o.student_id, o]));
    const absenceById = new Map<string, any>(
      (absenceRows || []).map((a: any) => [a.student_id, a]),
    );

    const students = members.map((r: any) => {
      const a = attById.get(r.user_id);
      const opt = optById.get(r.user_id);
      const abs = absenceById.get(r.user_id) ?? null;
      const attended = !!a?.attended;
      const joinedMs = a?.joined_at ? new Date(a.joined_at).getTime() : null;
      const leftMs = a?.left_at ? new Date(a.left_at).getTime() : null;
      const segments = Array.isArray(a?.attendance_intervals) ? a.attendance_intervals.length : (attended ? 1 : 0);
      const durationMinutes = a?.duration_minutes ?? null;
      const row = {
        id: r.user_id,
        name: r.user?.name || 'Student',
        avatar_url: r.user?.avatar_url || null,
        // Carried so the teacher can ring somebody straight off the missed list
        // rather than going to the student page for a number.
        phone: r.user?.phone || null,
        rsvp: opt ? 'not_attending' : 'attending',
        reason: opt ? (opt.reason_code || opt.reason || null) : null,
        attended,
        joined_at: a?.joined_at || null,
        left_at: a?.left_at || null,
        duration_minutes: durationMinutes,
        joinedLate: attended && joinedMs != null && Number.isFinite(joinedMs) && joinedMs - startMs > graceMs,
        // Left more than the grace window before the scheduled end.
        leftEarly: attended && leftMs != null && Number.isFinite(leftMs) && Number.isFinite(endMs) && endMs - leftMs > graceMs,
        // More than one join/leave segment means they dropped and rejoined.
        droppedMidClass: segments > 1,
        // Flagged, never reclassified. They stay `attended` so the register
        // never argues with what Teams reported; the flag just floats them to
        // the top of the list a teacher reads.
        barelyAttended:
          attended && durationMinutes != null && Number.isFinite(durationMinutes)
            ? durationMinutes < barelyCutoff
            : false,
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
      };
      return { ...row, bucket: bucketFor(row) };
    });

    const rosterSize = students.length;
    const present = students.filter((s: any) => s.attended).length;
    const durations = students.filter((s: any) => s.attended && s.duration_minutes != null).map((s: any) => s.duration_minutes);
    const avgDuration = durations.length ? Math.round(durations.reduce((x: number, y: number) => x + y, 0) / durations.length) : 0;

    // The five states, counted once each. Named stateTally only because `buckets`
    // below is the older RSVP-vs-actual matrix, which answers a different
    // question (did the RSVP predict the room) and is still shown.
    const stateTally = tallyBuckets(students);

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
        // The follow-up picture. missedNoReason is the number this whole panel
        // exists to make visible: away, silent, and nothing done about it.
        missedNoReason: stateTally.missed_no_reason,
        missedWithReason: stateTally.missed_with_reason,
        caughtUp: stateTally.caught_up,
        excused: stateTally.excused,
        notCaughtUp: stateTally.missed_no_reason + stateTally.missed_with_reason,
      },
      buckets,
      reasonTally: tallyReasons(optOuts || []),
      students,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load class insights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
