import {
  resolveOnlineMeetingDetailed,
  resolveOrganizerOid,
  type MeetingLookupFailure,
} from '@/lib/teams-online-meeting';

/**
 * Pull a class's attendance from Microsoft Teams.
 *
 * This lives in a lib rather than in the route because the same work has to run
 * two ways: on demand when a teacher taps "Sync from Teams" (delegated token
 * available), and unattended from a cron (no signed-in user at all). So nothing
 * here returns a `NextResponse`; the route and the cron each map the outcome.
 *
 * The hard-won context, all verified against production:
 *   - Every class meeting here is a Teams *channel* meeting, so its stored
 *     `teams_meeting_id` is an Outlook event id, not an onlineMeeting id.
 *   - The organizer is frequently NOT the assigned teacher, and 89 of 106
 *     meeting-bearing classes have no `teacher_id` at all. The organizer's oid
 *     is instead read out of the join URL's own `context` param.
 *   - Attendance therefore has to be read app-only, on behalf of that organizer.
 */

export type AttendanceSyncFailure =
  | 'no_meeting_linked'
  | 'no_organizer'
  | 'meeting_not_found'
  | 'app_permission_missing'
  | 'access_policy_missing'
  | 'not_organizer'
  | 'report_not_ready'
  | 'no_records'
  | 'graph_error';

export interface AttendanceSyncSuccess {
  ok: true;
  synced: number;
  noShows: number;
  reportId: string;
  /** Students in the Teams report we could not match to an enrolled user. */
  unmatched: number;
}

export interface AttendanceSyncError {
  ok: false;
  code: AttendanceSyncFailure;
  detail?: string;
}

export type AttendanceSyncOutcome = AttendanceSyncSuccess | AttendanceSyncError;

/** The class columns this sync needs. Keep in step with CLASS_SYNC_COLUMNS. */
export interface ClassMeetingRow {
  id: string;
  classroom_id: string;
  teams_meeting_id: string | null;
  teams_meeting_join_url: string | null;
  teams_meeting_url: string | null;
  teacher_id: string | null;
  organizer_email: string | null;
  organizer_ms_oid: string | null;
  online_meeting_id: string | null;
  scheduled_date: string;
  start_time: string;
}

export const CLASS_SYNC_COLUMNS =
  'id, classroom_id, teams_meeting_id, teams_meeting_join_url, teams_meeting_url, teacher_id, organizer_email, organizer_ms_oid, online_meeting_id, scheduled_date, start_time';

/** Human-facing explanation per failure code. Shown in the attendance UI. */
export const ATTENDANCE_FAILURE_MESSAGES: Record<AttendanceSyncFailure, string> = {
  no_meeting_linked: 'This class has no Teams meeting linked, so there is nothing to read attendance from.',
  no_organizer:
    'We could not work out who organized this meeting in Teams, so there is no mailbox to read the attendance from.',
  meeting_not_found:
    'Teams has no record of this meeting yet. That usually means it has not started, or it was created outside Nexus.',
  app_permission_missing:
    'Nexus is missing the Microsoft Graph application permission for meeting attendance. An administrator needs to grant OnlineMeetings.Read.All and OnlineMeetingArtifact.Read.All in Azure.',
  access_policy_missing:
    'Microsoft is refusing to let Nexus read this organizer’s meetings. An administrator needs to grant the Teams application access policy for the Nexus app.',
  not_organizer:
    'You did not organize this meeting in Teams, so Microsoft will not let your own account read its attendance. Nexus reads it on the organizer’s behalf instead, which needs the Teams application access policy to be granted.',
  report_not_ready:
    'Teams has not published an attendance report for this class yet. It usually appears a little while after the meeting ends.',
  no_records: 'Teams published an attendance report for this class, but it lists nobody.',
  graph_error: 'Microsoft Graph returned an unexpected error while reading attendance.',
};

/** Map a meeting-lookup failure onto the sync vocabulary. */
function fromLookupFailure(failure: MeetingLookupFailure): AttendanceSyncFailure {
  switch (failure) {
    case 'no_organizer':
      return 'no_organizer';
    case 'meeting_not_found':
      return 'meeting_not_found';
    case 'app_permission_missing':
      return 'app_permission_missing';
    case 'access_policy_missing':
      return 'access_policy_missing';
    case 'not_organizer':
      return 'not_organizer';
    default:
      return 'graph_error';
  }
}

interface GraphAttendanceInterval {
  joinDateTime?: string;
  leaveDateTime?: string;
  durationInSeconds?: number;
}

interface GraphAttendanceRecord {
  emailAddress?: string | null;
  totalAttendanceInSeconds?: number;
  attendanceIntervals?: GraphAttendanceInterval[];
  identity?: { id?: string | null; displayName?: string | null };
}

interface GraphAttendanceReport {
  id: string;
  meetingStartDateTime?: string;
  meetingEndDateTime?: string;
  totalParticipantCount?: number;
}

/**
 * Follow `@odata.nextLink` to the end. Graph pages `attendanceReports` and
 * `attendanceRecords` at 100 items, and a 30-student class that rejoins a few
 * times can exceed that, so a single unpaginated GET silently truncates.
 */
async function graphGetAllPages<T>(
  url: string,
  token: string,
): Promise<{ items: T[] } | { error: { status: number; body: string } }> {
  const items: T[] = [];
  let next: string | null = url;
  let guard = 0;

  while (next && guard < 25) {
    guard++;
    // Both annotations are load-bearing: without them TS sees `next` inferred
    // from `data`, which is inferred from `res`, which reads `next`, and bails.
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { error: { status: res.status, body } };
    }
    const data: { value?: T[]; '@odata.nextLink'?: string } = await res.json();
    if (Array.isArray(data.value)) items.push(...data.value);
    next = data['@odata.nextLink'] ?? null;
  }

  return { items };
}

/**
 * Pick the attendance report that belongs to THIS class.
 *
 * A recurring channel meeting reuses one onlineMeeting id, so Graph returns one
 * report per occurrence. Taking the last array element (what this code used to
 * do) has no ordering guarantee and will happily attribute another evening's
 * attendance to today's class, so match on start time instead.
 */
export function pickReportForClass(
  reports: GraphAttendanceReport[],
  classStart: Date,
  toleranceHours = 12,
): GraphAttendanceReport | null {
  if (reports.length === 0) return null;
  if (reports.length === 1) return reports[0];

  const toleranceMs = toleranceHours * 60 * 60 * 1000;
  let best: GraphAttendanceReport | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const report of reports) {
    const stamp = report.meetingStartDateTime ?? report.meetingEndDateTime;
    if (!stamp) continue;
    const delta = Math.abs(new Date(stamp).getTime() - classStart.getTime());
    if (Number.isNaN(delta)) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = report;
    }
  }

  if (best && bestDelta <= toleranceMs) return best;
  // Nothing within tolerance: fall back to the latest by start time rather than
  // array position, which is at least deterministic.
  const dated = reports
    .filter((r) => r.meetingStartDateTime)
    .sort((a, b) => (a.meetingStartDateTime! < b.meetingStartDateTime! ? 1 : -1));
  return dated[0] ?? null;
}

/**
 * Build a Teams-identity to Nexus-user map for the enrolled roster.
 *
 * Matching order matters. `record.identity.id` is the AAD object id and is the
 * only stable key. Email is a fallback because Graph preserves whatever casing
 * an admin typed into the UPN while PostgREST `.eq` is case-sensitive, which is
 * exactly how the previous implementation dropped students silently.
 */
export interface RosterUser {
  id: string;
  ms_oid: string | null;
  email: string | null;
  linked_classroom_email: string | null;
  personal_email: string | null;
}

export function buildRosterIndex(
  roster: Array<{ user_id: string; user: RosterUser | null }>,
): { byOid: Map<string, string>; byEmail: Map<string, string> } {
  const byOid = new Map<string, string>();
  const byEmail = new Map<string, string>();

  for (const row of roster) {
    const user = row.user;
    if (!user) continue;
    if (user.ms_oid) byOid.set(user.ms_oid.toLowerCase(), row.user_id);
    // All three email columns: a student may join from their classroom account,
    // their primary account, or a personal one, and 12 students have a
    // linked_classroom_email that differs from email.
    for (const email of [user.email, user.linked_classroom_email, user.personal_email]) {
      if (email) byEmail.set(email.toLowerCase(), row.user_id);
    }
  }

  return { byOid, byEmail };
}

export async function syncClassAttendance(
  supabase: any,
  cls: ClassMeetingRow,
  opts?: { delegatedToken?: string | null },
): Promise<AttendanceSyncOutcome> {
  if (!cls.teams_meeting_id) {
    return recordOutcome(supabase, cls.id, { ok: false, code: 'no_meeting_linked' });
  }

  const joinUrl = cls.teams_meeting_join_url || cls.teams_meeting_url || null;

  const organizerOid =
    cls.organizer_ms_oid ||
    (await resolveOrganizerOid(supabase, {
      joinUrl,
      organizerEmail: cls.organizer_email,
      teacherId: cls.teacher_id,
    }));

  if (!organizerOid && !opts?.delegatedToken) {
    return recordOutcome(supabase, cls.id, {
      ok: false,
      code: 'no_organizer',
      detail: 'no organizer oid from join URL, organizer_email, or teacher_id',
    });
  }

  const resolution = await resolveOnlineMeetingDetailed({
    delegatedToken: opts?.delegatedToken ?? null,
    teamsMeetingId: cls.teams_meeting_id,
    joinUrl,
    organizerOid,
    knownOnlineMeetingId: cls.online_meeting_id,
  });

  if (!resolution.meeting) {
    return recordOutcome(supabase, cls.id, {
      ok: false,
      code: fromLookupFailure(resolution.failure ?? 'meeting_not_found'),
      detail: resolution.detail,
    });
  }

  const { artifactBase, token } = resolution.meeting;
  // Which identity the artifact path reads as. A Teams application access policy
  // only governs `users/{oid}/...`, so a 403 on the delegated `me/...` base means
  // the caller is not the organizer, not that the tenant is misconfigured.
  const artifactIsAppOnly = artifactBase.startsWith('users/');

  const reportsResult = await graphGetAllPages<GraphAttendanceReport>(
    `https://graph.microsoft.com/v1.0/${artifactBase}/attendanceReports`,
    token,
  );

  if ('error' in reportsResult) {
    const { status, body } = reportsResult.error;
    console.error(`[attendance-sync] reports fetch failed for class ${cls.id}:`, status, body);
    return recordOutcome(supabase, cls.id, {
      ok: false,
      code: /Authorization_RequestDenied/i.test(body)
        ? 'app_permission_missing'
        : status === 403
          ? artifactIsAppOnly
            ? 'access_policy_missing'
            : 'not_organizer'
          : status === 404
            ? 'report_not_ready'
            : 'graph_error',
      detail: `${status} ${body.slice(0, 400)}`,
    });
  }

  if (reportsResult.items.length === 0) {
    return recordOutcome(supabase, cls.id, { ok: false, code: 'report_not_ready' });
  }

  const classStart = new Date(`${cls.scheduled_date}T${cls.start_time.substring(0, 5)}:00+05:30`);
  const report = pickReportForClass(reportsResult.items, classStart);

  if (!report) {
    return recordOutcome(supabase, cls.id, {
      ok: false,
      code: 'report_not_ready',
      detail: `${reportsResult.items.length} report(s) present but none datable to this class`,
    });
  }

  const recordsResult = await graphGetAllPages<GraphAttendanceRecord>(
    `https://graph.microsoft.com/v1.0/${artifactBase}/attendanceReports/${report.id}/attendanceRecords`,
    token,
  );

  if ('error' in recordsResult) {
    const { status, body } = recordsResult.error;
    console.error(`[attendance-sync] records fetch failed for class ${cls.id}:`, status, body);
    return recordOutcome(supabase, cls.id, {
      ok: false,
      code: 'graph_error',
      detail: `${status} ${body.slice(0, 400)}`,
    });
  }

  if (recordsResult.items.length === 0) {
    // Teams answered, it just listed nobody. That is a final answer, not a
    // "try again later", so retire the class from the cron instead of burning
    // five more attempts on it.
    return recordOutcome(supabase, cls.id, { ok: false, code: 'no_records' }, { terminal: true });
  }

  // Enrolled roster with every identity key we might match on, in one query
  // rather than the previous two-queries-per-record loop.
  const { data: roster } = await supabase
    .from('nexus_enrollments')
    .select(
      'user_id, user:users!nexus_enrollments_user_id_fkey(id, ms_oid, email, linked_classroom_email, personal_email)',
    )
    .eq('classroom_id', cls.classroom_id)
    .eq('role', 'student')
    .eq('is_active', true);

  const { byOid, byEmail } = buildRosterIndex(roster || []);

  // Existing rows, so a teacher's manual mark is never silently overwritten.
  const { data: existingRows } = await supabase
    .from('nexus_attendance')
    .select('student_id, source, attended')
    .eq('scheduled_class_id', cls.id);

  const existing = new Map<string, { source: string | null; attended: boolean | null }>(
    (existingRows || []).map((r: any) => [r.student_id, { source: r.source, attended: r.attended }]),
  );

  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let unmatched = 0;

  for (const record of recordsResult.items) {
    const oid = record.identity?.id?.toLowerCase();
    const email = record.emailAddress?.toLowerCase();
    const studentId = (oid && byOid.get(oid)) || (email && byEmail.get(email)) || null;

    if (!studentId) {
      unmatched++;
      continue;
    }
    if (seen.has(studentId)) continue;
    seen.add(studentId);

    const intervals = Array.isArray(record.attendanceIntervals) ? record.attendanceIntervals : [];
    const joinedAt = intervals[0]?.joinDateTime ?? null;
    const leftAt = intervals[intervals.length - 1]?.leaveDateTime ?? null;
    const durationMinutes = Math.round((record.totalAttendanceInSeconds || 0) / 60);

    const prior = existing.get(studentId);
    const manualOverride = prior?.source === 'manual';

    rows.push({
      scheduled_class_id: cls.id,
      student_id: studentId,
      // A teacher who marked this student by hand stays the authority on
      // present/absent. We still attach the Teams telemetry underneath it.
      attended: manualOverride ? prior?.attended ?? true : true,
      joined_at: joinedAt,
      left_at: leftAt,
      duration_minutes: durationMinutes,
      source: manualOverride ? 'manual' : 'teams',
      ...(intervals.length ? { attendance_intervals: intervals } : {}),
    });
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('nexus_attendance')
      .upsert(rows, { onConflict: 'scheduled_class_id,student_id' });
    if (upsertError) {
      return recordOutcome(supabase, cls.id, {
        ok: false,
        code: 'graph_error',
        detail: `attendance upsert failed: ${upsertError.message}`,
      });
    }
  }

  const noShows = await deriveNoShows(supabase, cls.id, cls.classroom_id);

  await supabase
    .from('nexus_scheduled_classes')
    .update({
      attendance_synced_at: new Date().toISOString(),
      attendance_sync_status: 'ok',
      attendance_sync_detail: null,
      // Cache what we resolved so the next sync of this class skips the lookup,
      // and so "who does Nexus think organized this" is answerable in SQL.
      ...(organizerOid && !cls.organizer_ms_oid ? { organizer_ms_oid: organizerOid } : {}),
      ...(cls.online_meeting_id !== resolution.meeting.meetingId
        ? { online_meeting_id: resolution.meeting.meetingId }
        : {}),
    })
    .eq('id', cls.id);

  return { ok: true, synced: rows.length, noShows, reportId: report.id, unmatched };
}

/**
 * Enrolled students with no attended row become `nexus_class_absences` no_shows
 * so the catch-up loop can chase them. A student who did attend loses any stale
 * absence row; an existing opted_out row keeps its reason via ignoreDuplicates.
 */
async function deriveNoShows(supabase: any, classId: string, classroomId: string): Promise<number> {
  const [{ data: enrolled }, { data: attRows }] = await Promise.all([
    supabase
      .from('nexus_enrollments')
      .select('user_id, role')
      .eq('classroom_id', classroomId)
      .eq('is_active', true),
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

  return noShows.length;
}

/**
 * Persist why a sync produced nothing, and count the attempt, so the UI can
 * explain itself and the cron can stop retrying a permanently missing report.
 */
async function recordOutcome(
  supabase: any,
  classId: string,
  outcome: AttendanceSyncError,
  opts?: { terminal?: boolean },
): Promise<AttendanceSyncOutcome> {
  try {
    const { data: current } = await supabase
      .from('nexus_scheduled_classes')
      .select('attendance_sync_attempts')
      .eq('id', classId)
      .maybeSingle();

    await supabase
      .from('nexus_scheduled_classes')
      .update({
        attendance_sync_status: outcome.code,
        attendance_sync_detail: outcome.detail ?? null,
        attendance_sync_attempts: (current?.attendance_sync_attempts ?? 0) + 1,
        // Stamping synced_at is what removes the class from the cron's candidate
        // set, so only do it when a retry genuinely cannot change the answer.
        ...(opts?.terminal ? { attendance_synced_at: new Date().toISOString() } : {}),
      })
      .eq('id', classId);
  } catch {
    // Status bookkeeping must never mask the real outcome.
  }
  return { ok: false, code: outcome.code, detail: outcome.detail };
}
