import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { canUser, canTutor } from '@/lib/staff-capabilities';
import { assertCanTutor } from '@/lib/staff-scope';
import { errorResponse } from '@/lib/api-errors';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { fetchGroupCalendarView } from '@/lib/teams-meeting-sync';
import {
  resolveGeneralChannelId,
  fetchRecordingsFromChannel,
  matchRecordingToClass,
  parseRecordingFileName,
  istDateOf,
  type RecordingFile,
} from '@/lib/channel-recordings';
import {
  planBackfill,
  buildBackfillRow,
  planMetadataRepair,
  type ExistingClassRow,
  type PlannedRow,
  type StatusFix,
} from '@/lib/teams-backfill';
import { parseChannelJoinUrl } from '@/lib/teams-attendance-probe';
import {
  syncClassAttendance,
  CLASS_SYNC_COLUMNS,
  ATTENDANCE_FAILURE_MESSAGES,
  type ClassMeetingRow,
} from '@/lib/attendance-sync';

/**
 * POST /api/timetable/backfill
 *
 * Import past Teams classes into the timetable, attach their recordings, and
 * pull their attendance. `mode: 'preview'` writes nothing and is what the UI
 * shows before the operator ticks anything.
 *
 * Deliberately does not reuse `syncClassroomMeetings`. That reconciler cancels
 * any class whose matched event is cancelled, rewrites titles and times on rows
 * it already knows, and inserts without publish_state. Over a month wide window
 * that is a mass-cancel with student notifications attached. This route never
 * cancels on its own: a Nexus class with no matching Teams event is reported as
 * an orphan, and mirroring a real Teams cancellation is off unless asked for.
 *
 * It does repair the reverse, which is what "make the timetable match Teams"
 * usually means in practice: a class sitting at `cancelled` in Nexus while its
 * Teams event is alive gets put back, along with the organizer and teacher
 * columns an earlier import left null.
 */

export const dynamic = 'force-dynamic';

/** Attendance rows attempted per apply call. The UI offers "run again". */
const DEFAULT_ATTENDANCE_LIMIT = 10;
const MAX_ATTENDANCE_LIMIT = 25;
/** Graph's cloud-communications bucket is per app per tenant; a burst throttles everyone. */
const ATTENDANCE_GAP_MS = 250;
/** Matches MAX_ATTEMPTS in the sync-attendance cron. */
const MAX_SYNC_ATTEMPTS = 6;
/** Wider than sync-now's 1.5h: an old recording can be published well after the class. */
const BACKFILL_RECORDING_TOLERANCE_HOURS = 3;
/** Tighter than the 12h default: a recurring channel meeting reuses one id. */
const BACKFILL_REPORT_TOLERANCE_HOURS = 4;

interface BackfillRequestBody {
  classroom_id?: string;
  from?: string;
  to?: string;
  mode?: 'preview' | 'apply';
  steps?: {
    classes?: boolean;
    recordings?: boolean;
    attendance?: boolean;
    /** Restore falsely cancelled classes and fill null organizer/teacher columns. */
    reconcile?: boolean;
    /**
     * Also push a real Teams cancellation onto a live Nexus row. Off by default:
     * it hides a class from every enrolled student, so it is opt-in every time.
     */
    mirror_cancellations?: boolean;
    link_channel?: boolean;
  };
  /** apply only: the exact planned rows the operator ticked, by PlannedRow.key. */
  keys?: string[];
  /**
   * apply only: Nexus classes with no matching Teams event to put back to
   * `scheduled`. Separate from `keys` because these rows are not in the plan.
   */
  restore_class_ids?: string[];
  /** Who taught these classes. Only ever written where teacher_id is null. */
  teacher_id?: string;
  reset_attendance_attempts?: boolean;
  attendance_limit?: number;
}

interface RowResult {
  key: string;
  source: string;
  subject: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  duration_estimated: boolean;
  is_cancelled: boolean;
  action: string;
  matched_on: string | null;
  class_id: string | null;
  /** How Nexus and Teams currently disagree, and what fixing it would change. */
  reconcile: {
    existing_status: string | null;
    status_fix: StatusFix | null;
    /** Column names this run would fill in, all of them currently null. */
    fills: string[];
    result?: 'restored' | 'cancelled' | 'updated' | 'skipped' | 'error';
    error?: string;
  };
  result?: 'imported' | 'duplicate' | 'skipped' | 'error';
  error?: string;
  recording: {
    action: 'attach' | 'already_set' | 'none';
    name: string | null;
    result?: 'attached' | 'skipped' | 'error';
    error?: string;
  };
  attendance: {
    status: string | null;
    attempts: number;
    synced_at: string | null;
    retryable: boolean;
    mode?: 'delegated_organizer' | 'app_only' | 'skipped';
    ok?: boolean;
    code?: string;
    detail?: string;
    synced?: number;
    no_shows?: number;
    unmatched?: number;
  };
}

const isoDate = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 10);
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().substring(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = (await request.json()) as BackfillRequestBody;
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!canUser(user, 'teach.timetable.schedule')) {
      return NextResponse.json(
        { error: 'Only the Neram team can backfill classes from Teams.' },
        { status: 403 },
      );
    }

    const classroomId = body.classroom_id;
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    const today = istToday();
    const from = isoDate(body.from) ?? `${today.substring(0, 7)}-01`;
    const to = isoDate(body.to) ?? today;
    if (from > to) {
      return NextResponse.json({ error: '"from" must not be after "to"' }, { status: 400 });
    }

    const mode = body.mode === 'apply' ? 'apply' : 'preview';
    const steps = {
      classes: body.steps?.classes !== false,
      recordings: body.steps?.recordings !== false,
      attendance: body.steps?.attendance !== false,
      reconcile: body.steps?.reconcile !== false,
      mirror_cancellations: body.steps?.mirror_cancellations === true,
      link_channel: body.steps?.link_channel === true,
    };

    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('id, name, type, ms_team_id, ms_channel_id, is_archived')
      .eq('id', classroomId)
      .single();

    if (!classroom) return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
    if (!classroom.ms_team_id) {
      return NextResponse.json({ error: 'Classroom has no linked Teams team' }, { status: 400 });
    }
    if (classroom.is_archived) {
      return NextResponse.json(
        { error: 'This classroom is archived and is read-only.' },
        { status: 409 },
      );
    }

    const appToken = await getAppOnlyToken();

    // Explicit +05:30. Graph reads an unzoned calendarView bound as UTC, while
    // the Prefer header only shapes the response, so an offset is the one form
    // that is right under either reading.
    const graphStart = `${from}T00:00:00+05:30`;
    const graphEnd = `${nextDay(to)}T00:00:00+05:30`;

    const events = await fetchGroupCalendarView(
      appToken,
      classroom.ms_team_id,
      graphStart,
      graphEnd,
      300,
    );

    const { data: existingRaw } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        'id, title, teams_meeting_id, teams_meeting_join_url, teams_meeting_url, scheduled_date, start_time, end_time, status, publish_state, recording_url, attendance_sync_status, attendance_sync_attempts, attendance_synced_at, teacher_id, organizer_ms_oid, organizer_name, organizer_email',
      )
      .eq('classroom_id', classroomId)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date');

    const existing = (existingRaw ?? []) as ExistingClassRow[];
    const existingById = new Map(existing.map((r) => [r.id, r]));

    // One channel listing per call, not one per class.
    let recordings: RecordingFile[] = [];
    let recordingsError: string | null = null;
    let resolvedChannelId: string | null = null;
    try {
      resolvedChannelId =
        classroom.ms_channel_id || (await resolveGeneralChannelId(appToken, classroom.ms_team_id));
      if (resolvedChannelId) {
        const all = await fetchRecordingsFromChannel(
          appToken,
          classroom.ms_team_id,
          resolvedChannelId,
          { maxItems: 500 },
        );
        recordings = all.filter((f) => {
          const parsed = parseRecordingFileName(f.name);
          const day = parsed ? parsed.startedAt.substring(0, 10) : istDateOf(f.createdDateTime);
          return day >= from && day <= to;
        });
      }
    } catch (err) {
      recordingsError = err instanceof Error ? err.message : String(err);
    }

    const { rows: planned, orphans } = planBackfill(events, recordings, existing);

    const organizerOid = deriveOrganizerOid(planned, existing);
    const now = new Date().toISOString();

    // Whoever is running the backfill is the default answer to "who taught this",
    // which is right for the common case of a teacher tidying up their own month.
    // An explicit teacher_id overrides it; neither ever overwrites a set value.
    //
    // assertCanTutor is the rule for every write to teacher_id, so a crafted
    // request cannot make a non-teaching manager the tutor of a month of classes.
    // The default falls back to null rather than throwing, because an admin who
    // does not teach may still legitimately run a backfill for someone else.
    let teacherId: string | null = null;
    if (typeof body.teacher_id === 'string' && body.teacher_id) {
      await assertCanTutor(body.teacher_id);
      teacherId = body.teacher_id;
    } else if (canTutor(user)) {
      teacherId = user.id;
    }

    const results: RowResult[] = planned.map((row) =>
      annotate(row, existingById, recordings, steps.recordings, teacherId),
    );

    if (mode === 'preview') {
      return NextResponse.json({
        mode,
        classroom: publicClassroom(classroom, resolvedChannelId),
        window: { from, to, graph_start: graphStart, graph_end: graphEnd },
        active_students: await countActiveStudents(supabase, classroomId),
        teacher_id: teacherId,
        rows: results,
        orphans: orphans.map(publicOrphan),
        summary: summarise(results, 0),
        recordings_error: recordingsError,
        notifications_suppressed: true,
      });
    }

    // ── APPLY ──────────────────────────────────────────────────────────────
    const selected = new Set(body.keys ?? []);
    const chosen = results.filter((r) => selected.has(r.key));

    // 1. Classes.
    if (steps.classes) {
      for (const result of chosen) {
        if (result.action !== 'import') {
          result.result = 'skipped';
          continue;
        }
        const row = planned.find((p) => p.key === result.key)!;
        const outcome = await insertClass(supabase, row, {
          classroomId,
          classroomType: classroom.type,
          teacherId,
          organizerOid,
          channelThreadId: channelThreadFrom(row, existing),
          now,
        });
        result.result = outcome.result;
        result.class_id = outcome.classId;
        if (outcome.error) result.error = outcome.error;
      }
    }

    // 2. Reconcile the rows that already exist: put back a class Nexus thinks was
    //    cancelled but Teams still lists, fill the organizer and teacher columns an
    //    earlier import left null, and (only when asked) mirror a genuine Teams
    //    cancellation. Runs before recordings so a class restored here is eligible
    //    for its recording in the same pass.
    const restoredOrphans: Array<{ class_id: string; ok: boolean; error?: string }> = [];

    if (steps.reconcile) {
      for (const result of chosen) {
        const row = planned.find((p) => p.key === result.key);
        const existingRow = result.class_id ? existingById.get(result.class_id) : undefined;
        if (!row || !existingRow || !result.class_id) continue;

        const patch: Record<string, unknown> = { ...planMetadataRepair(row, existingRow, { teacherId }) };

        if (row.status_fix === 'restore') {
          patch.status = 'scheduled';
        } else if (row.status_fix === 'cancel_in_nexus' && steps.mirror_cancellations) {
          patch.status = 'cancelled';
        }

        if (!Object.keys(patch).length) {
          result.reconcile.result = 'skipped';
          continue;
        }

        const { error } = await supabase
          .from('nexus_scheduled_classes')
          .update(patch)
          .eq('id', result.class_id);

        if (error) {
          result.reconcile.result = 'error';
          result.reconcile.error = error.message;
        } else {
          result.reconcile.result =
            patch.status === 'scheduled'
              ? 'restored'
              : patch.status === 'cancelled'
                ? 'cancelled'
                : 'updated';
          // Later steps read is_cancelled off the Teams event, but attendance also
          // checks the row it just wrote, so keep the local copy honest.
          if (patch.status) existingRow.status = patch.status as string;
        }
      }
    }

    // 2b. Orphans the operator explicitly asked to put back. These have no Teams
    //     event in the window at all, so nothing can be inferred about them: the
    //     only evidence is the operator saying the class ran. Restricted to rows
    //     that really are cancelled, so this can never resurrect anything else.
    if (steps.reconcile && body.restore_class_ids?.length) {
      const orphanIds = new Set(orphans.filter((o) => o.status === 'cancelled').map((o) => o.id));
      for (const classId of body.restore_class_ids) {
        if (!orphanIds.has(classId)) {
          restoredOrphans.push({
            class_id: classId,
            ok: false,
            error: 'Not a cancelled class without a Teams event in this window.',
          });
          continue;
        }
        const { error } = await supabase
          .from('nexus_scheduled_classes')
          .update({ status: 'scheduled' })
          .eq('id', classId)
          .eq('classroom_id', classroomId);
        restoredOrphans.push({ class_id: classId, ok: !error, ...(error && { error: error.message }) });
      }
    }

    // 3. Recordings. The `.is('recording_url', null)` guard is what stops an
    //    existing recap URL being clobbered by a fuzzy filename match.
    if (steps.recordings) {
      for (const result of chosen) {
        if (result.recording.action !== 'attach' || !result.class_id) continue;
        const match = recordings.find((f) => f.name === result.recording.name);
        if (!match) continue;
        const { error } = await supabase
          .from('nexus_scheduled_classes')
          .update({ recording_url: match.webUrl, recording_fetched_at: now })
          .eq('id', result.class_id)
          .is('recording_url', null);
        result.recording.result = error ? 'error' : 'attached';
        if (error) result.recording.error = error.message;
      }
    }

    // 4. Link the General channel, so future posts and recording scans skip the
    //    lookup. One row, one column, only when asked.
    let channelLinked = false;
    if (steps.link_channel && resolvedChannelId && !classroom.ms_channel_id) {
      const { error } = await supabase
        .from('nexus_classrooms')
        .update({ ms_channel_id: resolvedChannelId })
        .eq('id', classroomId);
      channelLinked = !error;
    }

    // 5. Attendance.
    let attendanceRemaining = 0;
    let attendanceFallback: { reason: string; options: string[] } | null = null;

    if (steps.attendance) {
      const limit = Math.min(
        Math.max(Math.round(Number(body.attendance_limit)) || DEFAULT_ATTENDANCE_LIMIT, 1),
        MAX_ATTENDANCE_LIMIT,
      );
      const targets = chosen.filter((r) => r.class_id && !r.is_cancelled);

      if (body.reset_attendance_attempts && targets.length) {
        await supabase
          .from('nexus_scheduled_classes')
          .update({
            attendance_sync_attempts: 0,
            attendance_synced_at: null,
            attendance_sync_status: null,
            attendance_sync_detail: null,
          })
          .in(
            'id',
            targets.map((t) => t.class_id),
          );
        for (const t of targets) {
          t.attendance.attempts = 0;
          t.attendance.synced_at = null;
          t.attendance.status = null;
          t.attendance.retryable = true;
        }
      }

      const queue = targets.filter((t) => t.attendance.retryable && !t.attendance.synced_at);
      attendanceRemaining = Math.max(queue.length - limit, 0);

      const delegatedToken = extractBearerToken(request.headers.get('Authorization'));
      const callerOid = msUser.oid.toLowerCase();
      let throttled = false;

      for (const target of queue.slice(0, limit)) {
        if (throttled) {
          target.attendance.mode = 'skipped';
          target.attendance.detail = 'Stopped early after Microsoft Graph throttled the previous call.';
          continue;
        }

        const { data: clsRow } = await supabase
          .from('nexus_scheduled_classes')
          .select(CLASS_SYNC_COLUMNS)
          .eq('id', target.class_id)
          .single();

        if (!clsRow) {
          target.attendance.mode = 'skipped';
          target.attendance.detail = 'Class row disappeared between planning and sync.';
          continue;
        }

        const cls = clsRow as ClassMeetingRow;
        const joinUrl = cls.teams_meeting_join_url || cls.teams_meeting_url || null;
        const rowOrganizer =
          cls.organizer_ms_oid || (joinUrl ? parseChannelJoinUrl(joinUrl).organizerOid : null);
        const isOrganizer = !!rowOrganizer && rowOrganizer.toLowerCase() === callerOid;

        if (!cls.teams_meeting_id) {
          target.attendance.mode = 'skipped';
          target.attendance.detail =
            'This class was discovered from its recording alone, so Teams has no meeting to read attendance from.';
          continue;
        }

        // Passing null for a non-organizer is deliberate. resolveOnlineMeeting
        // would otherwise call /me, take a guaranteed 3003 403, and failureRank
        // can only ever discard that. It costs a Graph call and buries the real
        // app-only diagnosis under a useless one.
        const outcome = await syncClassAttendance(supabase, cls, {
          delegatedToken: isOrganizer ? delegatedToken : null,
          preferDelegated: isOrganizer,
          reportToleranceHours: BACKFILL_REPORT_TOLERANCE_HOURS,
        });

        target.attendance.mode = isOrganizer ? 'delegated_organizer' : 'app_only';
        target.attendance.ok = outcome.ok;
        if (outcome.ok) {
          target.attendance.synced = outcome.synced;
          target.attendance.no_shows = outcome.noShows;
          target.attendance.unmatched = outcome.unmatched;
          target.attendance.synced_at = new Date().toISOString();
        } else {
          target.attendance.code = outcome.code;
          target.attendance.detail =
            outcome.detail ||
            ATTENDANCE_FAILURE_MESSAGES[outcome.code] ||
            'Microsoft Graph refused the read.';
          if (!isOrganizer && rowOrganizer) {
            target.attendance.detail +=
              ` The organizer of this meeting is ${rowOrganizer}; signing in as them lets Nexus read attendance without any Teams policy.`;
          }
          throttled = /429|Retry-After|throttl/i.test(target.attendance.detail);
        }

        await sleep(ATTENDANCE_GAP_MS);
      }

      const anyOk = chosen.some((r) => r.attendance.ok);
      const firstFailure = chosen.find((r) => r.attendance.ok === false);
      if (!anyOk && firstFailure?.attendance.code) {
        attendanceFallback = {
          reason: firstFailure.attendance.code,
          options: [
            'Grant the Teams application access policy for the Nexus app (see the probe endpoint for the exact PowerShell).',
            'Ask the meeting organizer to sign into Nexus and run the backfill, so their own token is used.',
            'Mark attendance by hand from each class\'s Attendance sheet.',
          ],
        };
      }
    }

    return NextResponse.json({
      mode,
      classroom: publicClassroom(classroom, resolvedChannelId),
      window: { from, to, graph_start: graphStart, graph_end: graphEnd },
      active_students: await countActiveStudents(supabase, classroomId),
      teacher_id: teacherId,
      rows: chosen,
      orphans: orphans.map(publicOrphan),
      restored_orphans: restoredOrphans,
      summary: summarise(chosen, attendanceRemaining),
      channel_linked: channelLinked,
      attendance_fallback: attendanceFallback,
      recordings_error: recordingsError,
      // These are classes that already happened. A "new class scheduled" push
      // for a date three weeks ago is noise to every enrolled student.
      notifications_suppressed: true,
    });
  } catch (err) {
    return errorResponse(err, 'Backfill failed');
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function publicClassroom(classroom: any, resolvedChannelId: string | null) {
  return {
    id: classroom.id,
    name: classroom.name,
    type: classroom.type,
    ms_team_id: classroom.ms_team_id,
    ms_channel_id: classroom.ms_channel_id,
    resolved_channel_id: resolvedChannelId,
  };
}

/**
 * A Nexus class the window found no Teams event for.
 *
 * Reported, never acted on by default. `can_restore` marks the one case worth an
 * operator's attention: a cancelled class whose calendar entry is gone, which
 * looks identical whether the class ran and the entry was tidied away or the
 * class really was called off. Only a human knows which.
 */
function publicOrphan(o: ExistingClassRow) {
  return {
    class_id: o.id,
    title: o.title,
    scheduled_date: o.scheduled_date,
    start_time: o.start_time,
    status: o.status,
    has_recording: !!o.recording_url,
    can_restore: o.status === 'cancelled',
  };
}

async function countActiveStudents(supabase: any, classroomId: string): Promise<number> {
  const { count } = await supabase
    .from('nexus_enrollments')
    .select('user_id', { count: 'exact', head: true })
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);
  return count ?? 0;
}

/**
 * The organizer oid to stamp on newly imported rows. Read off the join URLs we
 * already have rather than guessed from teacher_id, because on this data the
 * organizer is an admin and teacher_id is null on most historical rows.
 */
function deriveOrganizerOid(planned: PlannedRow[], existing: ExistingClassRow[]): string | null {
  for (const row of planned) {
    if (!row.join_url) continue;
    const oid = parseChannelJoinUrl(row.join_url).organizerOid;
    if (oid) return oid;
  }
  for (const row of existing) {
    const url = row.teams_meeting_join_url || row.teams_meeting_url;
    if (!url) continue;
    const oid = parseChannelJoinUrl(url).organizerOid;
    if (oid) return oid;
  }
  return null;
}

function channelThreadFrom(row: PlannedRow, existing: ExistingClassRow[]): string | null {
  if (row.join_url) {
    const thread = parseChannelJoinUrl(row.join_url).threadId;
    if (thread) return thread;
  }
  for (const other of existing) {
    const url = other.teams_meeting_join_url || other.teams_meeting_url;
    if (!url) continue;
    const thread = parseChannelJoinUrl(url).threadId;
    if (thread) return thread;
  }
  return null;
}

/** Attach the recording match, the status disagreement and attendance state. */
function annotate(
  row: PlannedRow,
  existingById: Map<string, ExistingClassRow>,
  recordings: RecordingFile[],
  wantRecordings: boolean,
  teacherId: string | null,
): RowResult {
  const existing = row.existing_class_id ? existingById.get(row.existing_class_id) : undefined;
  const alreadyHasRecording = !!existing?.recording_url;

  let recordingAction: 'attach' | 'already_set' | 'none' = 'none';
  let recordingName: string | null = row.recording_name;

  if (alreadyHasRecording) {
    recordingAction = 'already_set';
  } else if (wantRecordings && !row.is_cancelled) {
    if (row.source === 'recording') {
      recordingAction = 'attach';
    } else {
      const match = matchRecordingToClass(
        recordings,
        { scheduled_date: row.scheduled_date, start_time: row.start_time, title: row.subject },
        { toleranceHours: BACKFILL_RECORDING_TOLERANCE_HOURS },
      );
      if (match) {
        recordingAction = 'attach';
        recordingName = match.name;
      }
    }
  }

  const attempts = existing?.attendance_sync_attempts ?? 0;

  return {
    key: row.key,
    source: row.source,
    subject: row.subject,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_estimated: row.duration_estimated,
    is_cancelled: row.is_cancelled,
    action: row.action,
    matched_on: row.matched_on,
    class_id: row.existing_class_id,
    reconcile: {
      existing_status: row.existing_status,
      status_fix: row.status_fix,
      fills: existing ? Object.keys(planMetadataRepair(row, existing, { teacherId })) : [],
    },
    recording: { action: recordingAction, name: recordingName },
    attendance: {
      status: existing?.attendance_sync_status ?? null,
      attempts,
      synced_at: existing?.attendance_synced_at ?? null,
      retryable: attempts < MAX_SYNC_ATTEMPTS,
    },
  };
}

/**
 * Insert one class.
 *
 * Not an upsert: `uq_scheduled_classes_meeting_classroom` is a PARTIAL index
 * (WHERE teams_meeting_id IS NOT NULL) and PostgREST cannot emit the predicate
 * Postgres needs to infer it as an ON CONFLICT arbiter. Pre-check, insert, and
 * treat a 23505 as a duplicate rather than failing the whole batch.
 */
async function insertClass(
  supabase: any,
  row: PlannedRow,
  ctx: {
    classroomId: string;
    classroomType: string | null;
    teacherId: string | null;
    organizerOid: string | null;
    channelThreadId: string | null;
    now: string;
  },
): Promise<{ result: 'imported' | 'duplicate' | 'error'; classId: string | null; error?: string }> {
  if (row.event_id) {
    const { data: clash } = await supabase
      .from('nexus_scheduled_classes')
      .select('id')
      .eq('classroom_id', ctx.classroomId)
      .eq('teams_meeting_id', row.event_id)
      .maybeSingle();
    if (clash) return { result: 'duplicate', classId: clash.id };
  }

  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .insert(buildBackfillRow(row, ctx) as never)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('nexus_scheduled_classes')
        .select('id')
        .eq('classroom_id', ctx.classroomId)
        .eq('teams_meeting_id', row.event_id ?? '')
        .maybeSingle();
      return { result: 'duplicate', classId: existing?.id ?? null };
    }
    return { result: 'error', classId: null, error: error.message };
  }

  return { result: 'imported', classId: data?.id ?? null };
}

function summarise(rows: RowResult[], attendanceRemaining: number) {
  return {
    total: rows.length,
    to_import: rows.filter((r) => r.action === 'import').length,
    already_exist: rows.filter((r) => r.action.startsWith('exists')).length,
    cancelled: rows.filter((r) => r.action === 'skip_cancelled').length,
    to_restore: rows.filter((r) => r.reconcile.status_fix === 'restore').length,
    to_cancel: rows.filter((r) => r.reconcile.status_fix === 'cancel_in_nexus').length,
    to_fill: rows.filter((r) => r.reconcile.fills.length > 0).length,
    restored: rows.filter((r) => r.reconcile.result === 'restored').length,
    reconciled: rows.filter(
      (r) => r.reconcile.result && !['skipped', 'error'].includes(r.reconcile.result),
    ).length,
    imported: rows.filter((r) => r.result === 'imported').length,
    duplicates: rows.filter((r) => r.result === 'duplicate').length,
    errors: rows.filter((r) => r.result === 'error').length,
    recordings_available: rows.filter((r) => r.recording.action === 'attach').length,
    recordings_attached: rows.filter((r) => r.recording.result === 'attached').length,
    attendance_ok: rows.filter((r) => r.attendance.ok === true).length,
    attendance_failed: rows.filter((r) => r.attendance.ok === false).length,
    attendance_remaining: attendanceRemaining,
  };
}
