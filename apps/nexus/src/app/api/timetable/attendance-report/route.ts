import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveOnlineMeeting } from '@/lib/teams-online-meeting';

/**
 * GET /api/timetable/attendance-report?class_id={id}&classroom_id={id}
 * Returns detailed attendance for a class (teachers only).
 * Students see only their own attendance.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classId = request.nextUrl.searchParams.get('class_id');
    const classroomId = request.nextUrl.searchParams.get('classroom_id');

    if (!classId || !classroomId) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    if (enrollment.role === 'teacher') {
      // Return the FULL enrolled roster, not just students who already have an
      // attendance row. Imported/channel classes often have zero rows (Teams sync
      // can't read a group-organized meeting), so the teacher needs every student
      // listed with a present/absent toggle to mark attendance manually.
      const [{ data: roster }, { data: attRows, error: attErr }] = await Promise.all([
        supabase
          .from('nexus_enrollments')
          .select('user_id, student:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url)')
          .eq('classroom_id', classroomId)
          .eq('role', 'student')
          .eq('is_active', true),
        supabase
          .from('nexus_attendance')
          .select('*, student:users!nexus_attendance_student_id_fkey(id, name, email, avatar_url)')
          .eq('scheduled_class_id', classId),
      ]);

      if (attErr) throw attErr;

      const attByStudent = new Map<string, any>((attRows || []).map((a: any) => [a.student_id, a]));
      // One row per enrolled student, carrying their attendance state (unmarked =
      // treated as absent) so the sheet can render a switch for everyone.
      const merged = (roster || []).map((r: any) => {
        const a = attByStudent.get(r.user_id);
        return {
          id: a?.id ?? null,
          student_id: r.user_id,
          attended: a?.attended ?? false,
          joined_at: a?.joined_at ?? null,
          left_at: a?.left_at ?? null,
          duration_minutes: a?.duration_minutes ?? null,
          source: a?.source ?? null,
          student: a?.student ?? r.student,
        };
      });

      const present = merged.filter((a) => a.attended).length;
      const total = merged.length;

      return NextResponse.json({
        attendance: merged,
        summary: { present, absent: total - present, total },
      });
    } else {
      // Student sees only their own attendance
      const { data, error } = await supabase
        .from('nexus_attendance')
        .select('*')
        .eq('scheduled_class_id', classId)
        .eq('student_id', user.id)
        .maybeSingle();

      if (error) throw error;

      return NextResponse.json({ attendance: data });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load attendance';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/attendance-report
 * Sync attendance from Teams or manually mark attendance.
 * action: 'sync_teams' | 'manual_mark'
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { class_id, classroom_id, action } = body;

    if (!class_id || !classroom_id || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Verify teacher role
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can manage attendance' }, { status: 403 });
    }

    // Verify the class belongs to this classroom
    const { data: classCheck } = await supabase
      .from('nexus_scheduled_classes')
      .select('id')
      .eq('id', class_id)
      .eq('classroom_id', classroom_id)
      .single();

    if (!classCheck) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
    }

    if (action === 'sync_teams') {
      return await syncTeamsAttendance(class_id, classroom_id, token!, supabase);
    } else if (action === 'manual_mark') {
      return await manualMarkAttendance(class_id, classroom_id, body.records, supabase);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update attendance';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Sync attendance from Microsoft Teams meeting attendance reports.
 */
async function syncTeamsAttendance(
  classId: string,
  classroomId: string,
  token: string,
  supabase: any
) {
  // Get the scheduled class to find the meeting ID and organizer
  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('teams_meeting_id, teams_meeting_join_url, teams_meeting_url, teacher_id')
    .eq('id', classId)
    .single();

  if (!cls?.teams_meeting_id) {
    return NextResponse.json({ error: 'No Teams meeting linked to this class' }, { status: 400 });
  }

  // Get organizer's ms_oid for app-only API call
  const { data: teacher } = await supabase
    .from('users')
    .select('ms_oid')
    .eq('id', cls.teacher_id)
    .single();

  if (!teacher?.ms_oid) {
    return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
  }

  // The stored teams_meeting_id is an Outlook event id for channel/group meetings,
  // not an onlineMeeting id, and those meetings are organized by the Team (not the
  // teacher), so resolve the real onlineMeeting, delegated if the caller organized
  // it, else app-only on behalf of the organizer.
  const resolved = await resolveOnlineMeeting({
    delegatedToken: token,
    teamsMeetingId: cls.teams_meeting_id,
    joinUrl: cls.teams_meeting_join_url || cls.teams_meeting_url || null,
    organizerOid: teacher.ms_oid,
  });

  if (!resolved) {
    return NextResponse.json({
      error: 'Could not find this class’s Teams online meeting. It may not have taken place yet, or Nexus does not have permission to read its attendance.',
    }, { status: 400 });
  }

  // Fetch attendance reports (delegated or app-only, whichever resolved).
  const reportsRes = await fetch(
    `https://graph.microsoft.com/v1.0/${resolved.artifactBase}/attendanceReports`,
    { headers: { Authorization: `Bearer ${resolved.token}` } }
  );

  if (!reportsRes.ok) {
    // Keep the raw Graph text in server logs, but show the teacher a clean message.
    const errText = await reportsRes.text().catch(() => '');
    console.error('Attendance reports fetch failed:', reportsRes.status, errText);
    return NextResponse.json({
      error: 'Teams did not return an attendance report for this class yet. Attendance is available a little while after the meeting ends.',
    }, { status: 502 });
  }

  const reportsData = await reportsRes.json();
  const reports = reportsData.value || [];

  if (reports.length === 0) {
    return NextResponse.json({ message: 'No attendance reports found', synced: 0 });
  }

  // Use the most recent report
  const latestReport = reports[reports.length - 1];

  // Fetch attendance records
  const recordsRes = await fetch(
    `https://graph.microsoft.com/v1.0/${resolved.artifactBase}/attendanceReports/${latestReport.id}/attendanceRecords`,
    { headers: { Authorization: `Bearer ${resolved.token}` } }
  );

  if (!recordsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch attendance records' }, { status: 502 });
  }

  const recordsData = await recordsRes.json();
  const records = recordsData.value || [];

  let synced = 0;

  for (const record of records) {
    const email = record.emailAddress;
    if (!email) continue;

    // Look up user by email
    const { data: student } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!student) continue;

    // Verify student is enrolled in this classroom
    const { data: studentEnrollment } = await supabase
      .from('nexus_enrollments')
      .select('id')
      .eq('user_id', student.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .maybeSingle();

    if (!studentEnrollment) continue;

    // Calculate duration. Keep the FULL interval list too: >1 segment means the
    // student left and rejoined, which the insights view surfaces as a mid-class drop.
    const intervals = Array.isArray(record.attendanceIntervals) ? record.attendanceIntervals : [];
    const joinedAt = intervals[0]?.joinDateTime;
    const leftAt = intervals[intervals.length - 1]?.leaveDateTime;
    const totalSeconds = record.totalAttendanceInSeconds || 0;
    const durationMinutes = Math.round(totalSeconds / 60);

    // Upsert attendance record. attendance_intervals only spread in when present so
    // the write still works before that column's migration is applied.
    await supabase
      .from('nexus_attendance')
      .upsert(
        {
          scheduled_class_id: classId,
          student_id: student.id,
          attended: true,
          joined_at: joinedAt || null,
          left_at: leftAt || null,
          duration_minutes: durationMinutes,
          source: 'teams',
          ...(intervals.length ? { attendance_intervals: intervals } : {}),
        },
        { onConflict: 'scheduled_class_id,student_id' }
      );

    synced++;
  }

  // Derive no-shows: enrolled students with no "attended" row become
  // nexus_class_absences of kind no_show, so the catch-up loop can chase them.
  // A student who actually attended loses any stale absence row. An existing
  // opted_out row (with its reason) is left untouched via ignoreDuplicates.
  const [{ data: enrolled }, { data: attRows }] = await Promise.all([
    supabase.from('nexus_enrollments').select('user_id, role').eq('classroom_id', classroomId).eq('is_active', true),
    supabase.from('nexus_attendance').select('student_id, attended').eq('scheduled_class_id', classId),
  ]);
  const studentIds = (enrolled || []).filter((e: any) => e.role === 'student').map((e: any) => e.user_id);
  const attendedIds = (attRows || []).filter((a: any) => a.attended).map((a: any) => a.student_id);
  const attendedSet = new Set(attendedIds);
  const noShows = studentIds.filter((id: string) => !attendedSet.has(id));

  if (attendedIds.length > 0) {
    await supabase
      .from('nexus_class_absences')
      .delete()
      .eq('scheduled_class_id', classId)
      .in('student_id', attendedIds);
  }
  if (noShows.length > 0) {
    await supabase.from('nexus_class_absences').upsert(
      noShows.map((student_id: string) => ({
        scheduled_class_id: classId,
        student_id,
        classroom_id: classroomId,
        kind: 'no_show',
      })),
      { onConflict: 'scheduled_class_id,student_id', ignoreDuplicates: true },
    );
  }

  await supabase
    .from('nexus_scheduled_classes')
    .update({ attendance_synced_at: new Date().toISOString() })
    .eq('id', classId);

  return NextResponse.json({
    message: `Synced ${synced} attendance records`,
    synced,
    no_shows: noShows.length,
  });
}

/**
 * Manually mark attendance for students.
 */
async function manualMarkAttendance(
  classId: string,
  classroomId: string,
  records: Array<{ student_id: string; attended: boolean }>,
  supabase: any
) {
  if (!records || !Array.isArray(records)) {
    return NextResponse.json({ error: 'Missing records array' }, { status: 400 });
  }

  // Fetch enrolled student IDs to validate records
  const { data: enrolledStudents } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', classroomId)
    .eq('is_active', true);

  const enrolledIds = new Set((enrolledStudents || []).map((e: any) => e.user_id));
  const validRecords = records.filter((r) => enrolledIds.has(r.student_id));

  let updated = 0;

  for (const record of validRecords) {
    const { error } = await supabase
      .from('nexus_attendance')
      .upsert(
        {
          scheduled_class_id: classId,
          student_id: record.student_id,
          attended: record.attended,
          source: 'manual',
        },
        { onConflict: 'scheduled_class_id,student_id' }
      );

    if (!error) updated++;
  }

  return NextResponse.json({ message: `Updated ${updated} records`, updated });
}
