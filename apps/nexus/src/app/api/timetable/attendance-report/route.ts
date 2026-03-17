import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

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
      const { data, error } = await supabase
        .from('nexus_attendance')
        .select('*, student:users!nexus_attendance_student_id_fkey(id, name, email, avatar_url)')
        .eq('scheduled_class_id', classId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const present = (data || []).filter((a: any) => a.attended).length;
      const absent = (data || []).filter((a: any) => !a.attended).length;

      return NextResponse.json({
        attendance: data || [],
        summary: { present, absent, total: (data || []).length },
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
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can manage attendance' }, { status: 403 });
    }

    if (action === 'sync_teams') {
      return await syncTeamsAttendance(class_id, classroom_id, token!, supabase);
    } else if (action === 'manual_mark') {
      return await manualMarkAttendance(class_id, body.records, supabase);
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
    .select('teams_meeting_id, teacher_id')
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

  // Fetch attendance reports using delegated token
  const reportsRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/onlineMeetings/${cls.teams_meeting_id}/attendanceReports`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!reportsRes.ok) {
    const errText = await reportsRes.text().catch(() => '');
    return NextResponse.json({
      error: `Failed to fetch attendance reports: ${reportsRes.status} ${errText}`,
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
    `https://graph.microsoft.com/v1.0/me/onlineMeetings/${cls.teams_meeting_id}/attendanceReports/${latestReport.id}/attendanceRecords`,
    { headers: { Authorization: `Bearer ${token}` } }
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

    // Calculate duration
    const joinedAt = record.attendanceIntervals?.[0]?.joinDateTime;
    const leftAt = record.attendanceIntervals?.[record.attendanceIntervals.length - 1]?.leaveDateTime;
    const totalSeconds = record.totalAttendanceInSeconds || 0;
    const durationMinutes = Math.round(totalSeconds / 60);

    // Upsert attendance record
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
        },
        { onConflict: 'scheduled_class_id,student_id' }
      );

    synced++;
  }

  return NextResponse.json({ message: `Synced ${synced} attendance records`, synced });
}

/**
 * Manually mark attendance for students.
 */
async function manualMarkAttendance(
  classId: string,
  records: Array<{ student_id: string; attended: boolean }>,
  supabase: any
) {
  if (!records || !Array.isArray(records)) {
    return NextResponse.json({ error: 'Missing records array' }, { status: 400 });
  }

  let updated = 0;

  for (const record of records) {
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
