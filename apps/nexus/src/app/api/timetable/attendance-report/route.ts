import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { errorResponse } from '@/lib/api-errors';
import {
  syncClassAttendance,
  ATTENDANCE_FAILURE_MESSAGES,
  CLASS_SYNC_COLUMNS,
  type AttendanceSyncFailure,
  type ClassMeetingRow,
} from '@/lib/attendance-sync';

/** HTTP status per sync failure, so the client can tell "wait" from "misconfigured". */
const FAILURE_STATUS: Record<AttendanceSyncFailure, number> = {
  no_meeting_linked: 400,
  no_organizer: 400,
  meeting_not_found: 404,
  app_permission_missing: 503,
  access_policy_missing: 503,
  report_not_ready: 409,
  no_records: 200,
  graph_error: 502,
};

interface Caller {
  id: string;
  user_type: string | null;
  isStaff: boolean;
}

/**
 * Resolve the caller once. Staff is decided by `users.user_type`, NOT by a
 * classroom enrollment: production has 30 staff with an Entra identity but only
 * 6 teacher enrollments, so the old enrollment gate 403'd roughly 24 of them out
 * of every attendance report.
 */
async function resolveCaller(supabase: any, authHeader: string | null): Promise<Caller> {
  const msUser = await verifyMsToken(authHeader);
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();

  if (!user) throw new Error('User not found');

  return {
    id: user.id,
    user_type: user.user_type,
    isStaff: user.user_type === 'teacher' || user.user_type === 'admin',
  };
}

/**
 * GET /api/timetable/attendance-report?class_id={id}&classroom_id={id}
 *
 * Any teacher or admin sees the full roster for any class. Everyone else must be
 * enrolled in the classroom and sees only their own row.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const classId = request.nextUrl.searchParams.get('class_id');
    const classroomId = request.nextUrl.searchParams.get('classroom_id');

    if (!classId || !classroomId) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    const caller = await resolveCaller(supabase, request.headers.get('Authorization'));

    // Always confirm the class really belongs to the classroom in the query, so a
    // mismatched pair cannot be used to read a roster from somewhere else.
    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, attendance_synced_at, attendance_sync_status, attendance_sync_detail, teams_meeting_id')
      .eq('id', classId)
      .eq('classroom_id', classroomId)
      .maybeSingle();

    if (!cls) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
    }

    if (!caller.isStaff) {
      // Students (including an impersonated student, which verifyMsToken resolves
      // to the target's ms_oid) see only their own attendance.
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('role')
        .eq('user_id', caller.id)
        .eq('classroom_id', classroomId)
        .eq('is_active', true)
        .maybeSingle();

      if (!enrollment) {
        return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
      }

      const { data, error } = await supabase
        .from('nexus_attendance')
        .select('*')
        .eq('scheduled_class_id', classId)
        .eq('student_id', caller.id)
        .maybeSingle();

      if (error) throw error;

      return NextResponse.json({ attendance: data });
    }

    // Staff: the FULL enrolled roster, not just students who already have an
    // attendance row. Channel classes commonly have zero rows, so the teacher
    // needs every student listed with a present/absent toggle.
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
        attendance_intervals: a?.attendance_intervals ?? null,
        source: a?.source ?? null,
        student: a?.student ?? r.student,
      };
    });

    const present = merged.filter((a: { attended: boolean }) => a.attended).length;
    const total = merged.length;
    const status = cls.attendance_sync_status as AttendanceSyncFailure | 'ok' | null;

    return NextResponse.json({
      attendance: merged,
      summary: { present, absent: total - present, total },
      sync: {
        synced_at: cls.attendance_synced_at,
        status,
        // The whole point of persisting the status: say why a sync produced
        // nothing instead of leaving the teacher with a bare failure.
        message:
          status && status !== 'ok'
            ? ATTENDANCE_FAILURE_MESSAGES[status as AttendanceSyncFailure] ?? null
            : null,
        has_meeting: !!cls.teams_meeting_id,
      },
    });
  } catch (err) {
    return errorResponse(err, 'Failed to load attendance');
  }
}

/**
 * POST /api/timetable/attendance-report
 * action: 'sync_teams' | 'manual_mark'. Teachers and admins only.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const token = extractBearerToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { class_id, classroom_id, action } = body;

    if (!class_id || !classroom_id || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const caller = await resolveCaller(supabase, request.headers.get('Authorization'));
    if (!caller.isStaff) {
      return NextResponse.json({ error: 'Only teachers can manage attendance' }, { status: 403 });
    }

    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select(CLASS_SYNC_COLUMNS)
      .eq('id', class_id)
      .eq('classroom_id', classroom_id)
      .maybeSingle();

    if (!cls) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
    }

    if (action === 'sync_teams') {
      // The delegated token is only an accelerator for meetings this person
      // organized. Channel meetings resolve app-only, on behalf of the real
      // organizer, which is why this works for any staff member.
      const result = await syncClassAttendance(supabase, cls as ClassMeetingRow, {
        delegatedToken: token,
      });

      if (result.ok) {
        return NextResponse.json({
          message: `Synced ${result.synced} attendance records`,
          synced: result.synced,
          no_shows: result.noShows,
          unmatched: result.unmatched,
        });
      }

      // An empty report is not an error: Teams did answer, it just listed nobody.
      if (result.code === 'no_records') {
        return NextResponse.json({
          message: ATTENDANCE_FAILURE_MESSAGES.no_records,
          code: result.code,
          synced: 0,
        });
      }

      return NextResponse.json(
        { error: ATTENDANCE_FAILURE_MESSAGES[result.code], code: result.code },
        { status: FAILURE_STATUS[result.code] },
      );
    }

    if (action === 'manual_mark') {
      return await manualMarkAttendance(class_id, classroom_id, body.records, supabase, caller.id);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return errorResponse(err, 'Failed to update attendance');
  }
}

/** Manually mark attendance for students. */
async function manualMarkAttendance(
  classId: string,
  classroomId: string,
  records: Array<{ student_id: string; attended: boolean }>,
  supabase: any,
  markedBy: string,
) {
  if (!records || !Array.isArray(records)) {
    return NextResponse.json({ error: 'Missing records array' }, { status: 400 });
  }

  const { data: enrolledStudents } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', classroomId)
    .eq('is_active', true);

  const enrolledIds = new Set((enrolledStudents || []).map((e: any) => e.user_id));
  const validRecords = records.filter((r) => enrolledIds.has(r.student_id));

  if (validRecords.length === 0) {
    return NextResponse.json({ message: 'Updated 0 records', updated: 0 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('nexus_attendance').upsert(
    validRecords.map((record) => ({
      scheduled_class_id: classId,
      student_id: record.student_id,
      attended: record.attended,
      source: 'manual',
      marked_by: markedBy,
      marked_at: now,
    })),
    { onConflict: 'scheduled_class_id,student_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `Updated ${validRecords.length} records`, updated: validRecords.length });
}
