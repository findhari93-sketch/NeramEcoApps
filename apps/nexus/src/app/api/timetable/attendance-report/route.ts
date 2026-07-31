import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, loadClassroomRoster } from '@neram/database';
import { errorResponse } from '@/lib/api-errors';
import {
  syncClassAttendance,
  applyCsvAttendance,
  ATTENDANCE_FAILURE_MESSAGES,
  CLASS_SYNC_COLUMNS,
  type AttendanceSyncFailure,
  type ClassMeetingRow,
  type CsvAttendanceRow,
} from '@/lib/attendance-sync';
import { parseChannelJoinUrl } from '@/lib/teams-attendance-probe';
import { escapeIlike } from '@/lib/teams-online-meeting';

/** HTTP status per sync failure, so the client can tell "wait" from "misconfigured". */
const FAILURE_STATUS: Record<AttendanceSyncFailure, number> = {
  no_meeting_linked: 400,
  no_organizer: 400,
  meeting_not_found: 404,
  app_permission_missing: 503,
  access_policy_missing: 503,
  // Also a tenant-configuration problem from the caller's point of view: their
  // own account can never read a meeting they did not organize, so the fix is
  // the same access policy that lets Nexus read it on the organizer's behalf.
  not_organizer: 503,
  report_not_ready: 409,
  no_records: 200,
  graph_error: 502,
};

interface Caller {
  id: string;
  user_type: string | null;
  isStaff: boolean;
  /**
   * The AAD object id the request actually authenticated as, lowercased.
   *
   * Deliberately the token's oid rather than `users.ms_oid`: it is the identity
   * Graph will see if we hand its token onward, and it is what impersonation
   * resolves through. Compared against a meeting's organizer to decide whether
   * the delegated path is open.
   */
  msOid: string;
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
    msOid: String(msUser.oid ?? '').toLowerCase(),
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
      .select(
        // scheduled_date and start_time are here for the CSV import: the Teams
        // export writes bare wall-clock times with no offset, so the client
        // needs the class start to anchor them against.
        'id, attendance_synced_at, attendance_sync_status, attendance_sync_detail, teams_meeting_id, scheduled_date, start_time',
      )
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
    // linked_classroom_email and personal_email are requested purely so the CSV
    // import can match on them client-side. Matching on `email` alone misses the
    // students whose classroom account differs from their primary one, which is
    // a large minority of the roster. Staff-only branch, and staff already see
    // `email`, so this exposes nothing new.
    //
    // Dormant students are excluded: an unmarked register row defaults to
    // "absent", so leaving them in would manufacture an absence every class.
    const [{ members: roster }, { data: attRows, error: attErr }, { data: absenceRows }] =
      await Promise.all([
        loadClassroomRoster(classroomId, {
          userColumns: 'linked_classroom_email, personal_email',
          client: supabase,
        }),
        supabase
          .from('nexus_attendance')
          .select('*, student:users!nexus_attendance_student_id_fkey(id, name, email, avatar_url)')
          .eq('scheduled_class_id', classId),
        // Why each absent student says they were away, and how far they have got
        // with making it up. The sheet used to show a toggle and a join time and
        // nothing else, so a teacher marking the register could not see that the
        // student had already explained themselves and watched the recording.
        supabase
          .from('nexus_class_absences')
          .select(
            'student_id, kind, reason_code, reason_note, reason_source, reason_submitted_at, ' +
              'recording_watched_at, caught_up_at, excused_at',
          )
          .eq('scheduled_class_id', classId),
      ]);

    if (attErr) throw attErr;

    const attByStudent = new Map<string, any>((attRows || []).map((a: any) => [a.student_id, a]));
    const absenceByStudent = new Map<string, any>(
      (absenceRows || []).map((a: any) => [a.student_id, a]),
    );
    // One row per enrolled student, carrying their attendance state (unmarked =
    // treated as absent) so the sheet can render a switch for everyone.
    const merged = roster.map((r: any) => {
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
        // Every address this student might have joined Teams under, lowercased,
        // so the CSV import can match without a second round trip.
        match_emails: [
          r.user?.email,
          r.user?.linked_classroom_email,
          r.user?.personal_email,
        ]
          .filter(Boolean)
          .map((e: string) => e.toLowerCase()),
        student: a?.student ?? r.user,
        // Carried so the register can show who is a break-year or Class 12
        // student without a second request. It never affects the toggle.
        study_stage: r.current_standard ?? null,
        absence: absenceByStudent.get(r.user_id) ?? null,
      };
    });

    const present = merged.filter((a: { attended: boolean }) => a.attended).length;
    const total = merged.length;
    // Only meaningful for people who were away, so it is counted over the
    // absence rows rather than over "not present": an unmarked register would
    // otherwise report the whole class as unexplained.
    const explained = (absenceRows || []).filter((a: any) => a.reason_code).length;
    const caughtUp = (absenceRows || []).filter((a: any) => a.caught_up_at).length;
    const status = cls.attendance_sync_status as AttendanceSyncFailure | 'ok' | null;

    return NextResponse.json({
      attendance: merged,
      summary: {
        present,
        absent: total - present,
        total,
        missed: (absenceRows || []).length,
        explained,
        caughtUp,
      },
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
      class: {
        id: cls.id,
        scheduled_date: cls.scheduled_date,
        start_time: cls.start_time,
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
      const joinUrl = cls.teams_meeting_join_url || cls.teams_meeting_url || null;
      const rowOrganizer =
        cls.organizer_ms_oid || (joinUrl ? parseChannelJoinUrl(joinUrl).organizerOid : null);
      const isOrganizer = !!rowOrganizer && rowOrganizer.toLowerCase() === caller.msOid;

      // Passing the delegated token ONLY to the organizer is the whole point.
      //
      // An organizer's own token reads /me/onlineMeetings and needs no Teams
      // application access policy at all, so `preferDelegated` is the one route
      // that works while that tenant grant is outstanding. For everyone else the
      // delegated attempt is not merely useless, it is actively harmful: it costs
      // a guaranteed Graph round trip that returns 3003 "user does not have
      // access to lookup meeting", and `failureRank` can only ever discard that
      // result. This route used to pass the token unconditionally and so paid
      // that cost on every single sync. The backfill route already does it this
      // way; see backfill/route.ts.
      const result = await syncClassAttendance(supabase, cls as ClassMeetingRow, {
        delegatedToken: isOrganizer ? token : null,
        preferDelegated: isOrganizer,
      });

      const mode = isOrganizer ? 'delegated_organizer' : 'app_only';

      if (result.ok) {
        return NextResponse.json({
          message: `Synced ${result.synced} attendance records`,
          synced: result.synced,
          no_shows: result.noShows,
          unmatched: result.unmatched,
          mode,
        });
      }

      // Name the organizer on the failure path only, so the happy path stays at
      // its current query count. "Shanthi organized this" is actionable;
      // "f51c6475-0c5e-4ba5-9876-474668f381ec organized this" is not.
      let organizer: { name: string | null; is_caller: boolean } | null = null;
      if (rowOrganizer) {
        const { data: org } = await supabase
          .from('users')
          .select('name')
          .ilike('ms_oid', escapeIlike(rowOrganizer))
          .maybeSingle();
        organizer = { name: org?.name ?? null, is_caller: isOrganizer };
      }

      // An empty report is not an error: Teams did answer, it just listed nobody.
      if (result.code === 'no_records') {
        return NextResponse.json({
          message: ATTENDANCE_FAILURE_MESSAGES.no_records,
          code: result.code,
          synced: 0,
          mode,
          organizer,
        });
      }

      return NextResponse.json(
        { error: ATTENDANCE_FAILURE_MESSAGES[result.code], code: result.code, mode, organizer },
        { status: FAILURE_STATUS[result.code] },
      );
    }

    if (action === 'manual_mark') {
      return await manualMarkAttendance(class_id, classroom_id, body.records, supabase, caller.id);
    }

    if (action === 'import_teams_csv') {
      return await importTeamsCsv(cls as ClassMeetingRow, body, supabase, caller.id);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return errorResponse(err, 'Failed to update attendance');
  }
}

/**
 * Commit an attendance report the organizer downloaded out of Teams.
 *
 * The file is decoded, parsed and matched entirely in the browser, so what
 * arrives here is already a list of roster decisions. That is deliberate: it
 * keeps a multi-hundred-kilobyte UTF-16 file off the serverless function, lets a
 * teacher re-run the threshold with no round trip, and means exactly one
 * invocation is spent, at commit.
 *
 * What must NOT be trusted from the client is which students exist. The
 * enrollment re-check below is the same one `manual_mark` performs, and it is
 * the only thing standing between a hand-crafted payload and attendance rows
 * written against a student in another classroom.
 */
async function importTeamsCsv(
  cls: ClassMeetingRow,
  body: any,
  supabase: any,
  markedBy: string,
): Promise<NextResponse> {
  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No attendance rows to import' }, { status: 400 });
  }

  const { data: enrolled } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', cls.classroom_id)
    .eq('role', 'student')
    .eq('is_active', true);

  const enrolledIds = new Set((enrolled || []).map((e: any) => e.user_id));
  const accepted: CsvAttendanceRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (!row || typeof row.student_id !== 'string' || !enrolledIds.has(row.student_id)) {
      skipped++;
      continue;
    }
    accepted.push({
      student_id: row.student_id,
      attended: row.attended === true,
      duration_minutes:
        typeof row.duration_minutes === 'number' && Number.isFinite(row.duration_minutes)
          ? Math.max(0, Math.round(row.duration_minutes))
          : null,
      joined_at: typeof row.joined_at === 'string' ? row.joined_at : null,
      left_at: typeof row.left_at === 'string' ? row.left_at : null,
    });
  }

  if (accepted.length === 0) {
    return NextResponse.json(
      { error: 'None of those students are enrolled in this classroom.', skipped },
      { status: 400 },
    );
  }

  const { data: staff } = await supabase.from('users').select('name').eq('id', markedBy).maybeSingle();

  // Provenance goes in attendance_sync_detail rather than in new columns: it is
  // the field the attendance sheet already surfaces, and it is what makes an
  // imported class distinguishable from a Graph-synced one months later.
  const meta = body.meta ?? {};
  const detail = [
    `Imported from the Teams attendance report${staff?.name ? ` by ${staff.name}` : ''}`,
    meta.file_name ? ` (${String(meta.file_name).slice(0, 80)})` : '',
    `: ${accepted.length} matched`,
    typeof meta.unmatched === 'number' && meta.unmatched > 0 ? `, ${meta.unmatched} unmatched` : '',
    typeof body.threshold_seconds === 'number'
      ? `, present at ${Math.round(body.threshold_seconds / 60)}m or more`
      : '',
  ].join('');

  const result = await applyCsvAttendance(supabase, cls, accepted, { markedBy, detail });

  if (!result.ok) {
    // Not FAILURE_STATUS here: that map means "an empty Teams report is a valid
    // answer, so 200". An import that wrote nothing is a failed action from the
    // caller's point of view, and must not come back as a success.
    return NextResponse.json(
      { error: result.detail || ATTENDANCE_FAILURE_MESSAGES[result.code], code: result.code },
      { status: result.code === 'no_records' ? 400 : 502 },
    );
  }

  return NextResponse.json({
    message: `Imported ${result.synced} ${result.synced === 1 ? 'student' : 'students'} from the Teams report`,
    synced: result.synced,
    no_shows: result.noShows,
    skipped,
  });
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
