import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, loadClassroomRoster } from '@neram/database';
import { LATE_THRESHOLD_MINUTES } from '@/lib/class-absences';
import { tallyReasons } from '@/lib/rsvp-reasons';
import { ATTENDANCE_FAILURE_MESSAGES, type AttendanceSyncFailure } from '@/lib/attendance-sync';

/**
 * GET /api/timetable/class-insights?class_id={id}&classroom_id={id}  (teacher)
 *
 * The after-class picture: RSVP (who was expected, default-attending) reconciled
 * against the actual Teams attendance (who came, how long, late / left early /
 * dropped mid-class). Read-only; the teacher pulls fresh attendance via the
 * existing "Sync from Teams" action first. Reuses the same roster/attendance/RSVP
 * shapes as computeAbsencesForClass.
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
    const [{ members }, { data: attendance }, { data: optOuts }] = await Promise.all([
      loadClassroomRoster(classroomId, { client: supabase }),
      supabase
        .from('nexus_attendance')
        .select('student_id, attended, joined_at, left_at, duration_minutes, attendance_intervals')
        .eq('scheduled_class_id', classId),
      supabase
        .from('nexus_class_rsvp')
        .select('student_id, reason, reason_code')
        .eq('scheduled_class_id', classId)
        .eq('response', 'not_attending'),
    ]);

    const startMs = new Date(`${cls.scheduled_date}T${cls.start_time}+05:30`).getTime();
    const endMs = new Date(`${cls.scheduled_date}T${cls.end_time}+05:30`).getTime();
    const graceMs = LATE_THRESHOLD_MINUTES * 60 * 1000;

    const attById = new Map<string, any>((attendance || []).map((a: any) => [a.student_id, a]));
    const optById = new Map<string, any>((optOuts || []).map((o: any) => [o.student_id, o]));

    const students = members.map((r: any) => {
      const a = attById.get(r.user_id);
      const opt = optById.get(r.user_id);
      const attended = !!a?.attended;
      const joinedMs = a?.joined_at ? new Date(a.joined_at).getTime() : null;
      const leftMs = a?.left_at ? new Date(a.left_at).getTime() : null;
      const segments = Array.isArray(a?.attendance_intervals) ? a.attendance_intervals.length : (attended ? 1 : 0);
      return {
        id: r.user_id,
        name: r.user?.name || 'Student',
        avatar_url: r.user?.avatar_url || null,
        rsvp: opt ? 'not_attending' : 'attending',
        reason: opt ? (opt.reason_code || opt.reason || null) : null,
        attended,
        joined_at: a?.joined_at || null,
        left_at: a?.left_at || null,
        duration_minutes: a?.duration_minutes ?? null,
        joinedLate: attended && joinedMs != null && Number.isFinite(joinedMs) && joinedMs - startMs > graceMs,
        // Left more than the grace window before the scheduled end.
        leftEarly: attended && leftMs != null && Number.isFinite(leftMs) && Number.isFinite(endMs) && endMs - leftMs > graceMs,
        // More than one join/leave segment means they dropped and rejoined.
        droppedMidClass: segments > 1,
      };
    });

    const rosterSize = students.length;
    const present = students.filter((s: any) => s.attended).length;
    const durations = students.filter((s: any) => s.attended && s.duration_minutes != null).map((s: any) => s.duration_minutes);
    const avgDuration = durations.length ? Math.round(durations.reduce((x: number, y: number) => x + y, 0) / durations.length) : 0;

    // RSVP (expected) vs actual — the core comparison.
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
