import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { canUser } from '@/lib/staff-capabilities';
import { errorResponse } from '@/lib/api-errors';
import { getAppOnlyToken, decodeAppTokenRoles, ATTENDANCE_APP_ROLES } from '@/lib/graph-app-token';
import { fetchGroupCalendarView } from '@/lib/teams-meeting-sync';
import {
  resolveGeneralChannelId,
  fetchRecordingsFromChannel,
  parseRecordingFileName,
  istDateOf,
  type RecordingFile,
} from '@/lib/channel-recordings';
import { planBackfill, type ExistingClassRow } from '@/lib/teams-backfill';
import { probeAttendanceStrategies, parseChannelJoinUrl } from '@/lib/teams-attendance-probe';
import { escapeIlike } from '@/lib/teams-online-meeting';
import { buildNoAttendanceRouteRemedy } from '@/lib/teams-access-policy';
import { CLASS_SYNC_COLUMNS } from '@/lib/attendance-sync';

/**
 * GET /api/timetable/backfill/probe?classroom_id=&from=&to=&class_id=
 *
 * Answers, before anything is written, the two questions a Teams backfill turns
 * on:
 *
 *   1. What can we even see? How many meetings the group calendar holds for the
 *      window, how many already exist in Nexus, and what is sitting in the
 *      channel's Recordings folder. A class started with "Meet now" leaves no
 *      calendar event, so the two counts disagreeing is itself the finding.
 *   2. Can attendance be read at all? Every candidate Graph lookup is tried and
 *      all of them are reported, with Microsoft's own words kept verbatim.
 *
 * Strictly read-only. It deliberately does NOT call syncClassAttendance, because
 * that always finishes through recordOutcome and would spend two of the six
 * retries the nightly cron is allowed per class.
 */

export const dynamic = 'force-dynamic';

interface Step {
  step: string;
  ok: boolean;
  detail: string;
  remedy?: string;
}

/** IST today as YYYY-MM-DD. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 10);
}

function defaultWindow(): { from: string; to: string } {
  const today = istToday();
  return { from: `${today.substring(0, 7)}-01`, to: today };
}

const isoDate = (v: string | null): string | null =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** The day after `date`, as YYYY-MM-DD. Used for an exclusive upper bound. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().substring(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!canUser(user, 'teach.timetable.schedule')) {
      return NextResponse.json(
        { error: 'Only the Neram team can run a Teams backfill probe.' },
        { status: 403 },
      );
    }

    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    const fallback = defaultWindow();
    const from = isoDate(params.get('from')) ?? fallback.from;
    const to = isoDate(params.get('to')) ?? fallback.to;
    const steps: Step[] = [];

    // ── Classroom ──────────────────────────────────────────────────────────
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('id, name, type, ms_team_id, ms_channel_id, ms_channel_name, is_archived')
      .eq('id', classroomId)
      .single();

    steps.push({
      step: 'classroom',
      ok: !!classroom?.ms_team_id && !classroom?.is_archived,
      detail: !classroom
        ? 'Classroom not found'
        : classroom.is_archived
          ? `"${classroom.name}" is archived, so nothing can be written to it`
          : classroom.ms_team_id
            ? `"${classroom.name}" is linked to team ${classroom.ms_team_id}`
            : `"${classroom.name}" has no linked Teams team`,
      remedy: classroom && !classroom.ms_team_id
        ? 'Link the classroom to its Microsoft Team from the classroom page before backfilling.'
        : undefined,
    });

    if (!classroom?.ms_team_id || classroom.is_archived) {
      return respond(steps, { classroom, window: { from, to } });
    }

    const { count: activeStudents } = await supabase
      .from('nexus_enrollments')
      .select('user_id', { count: 'exact', head: true })
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    // ── Credentials and application permissions ────────────────────────────
    const missingEnv = ['AZ_CLIENT_ID', 'AZ_CLIENT_SECRET', 'AZ_TENANT_ID'].filter(
      (key) => !process.env[key],
    );
    steps.push({
      step: 'env',
      ok: missingEnv.length === 0,
      detail: missingEnv.length
        ? `Missing: ${missingEnv.join(', ')}`
        : 'AZ_CLIENT_ID, AZ_CLIENT_SECRET, AZ_TENANT_ID all present',
      remedy: missingEnv.length
        ? `Set ${missingEnv.join(', ')} on the Nexus Vercel project (production and preview).`
        : undefined,
    });
    if (missingEnv.length) return respond(steps, { classroom, window: { from, to } });

    let appToken: string | null = null;
    try {
      appToken = await getAppOnlyToken();
      steps.push({ step: 'app_token', ok: true, detail: 'Client credentials token acquired' });
    } catch (err) {
      steps.push({
        step: 'app_token',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        remedy:
          'The client secret has probably expired, or the tenant id is wrong. Create a new secret in the Azure app registration and update AZ_CLIENT_SECRET.',
      });
      return respond(steps, { classroom, window: { from, to } });
    }

    const roles = decodeAppTokenRoles(appToken);
    const missingRoles: string[] = [];
    if (!ATTENDANCE_APP_ROLES.meetingLookup.some((r) => roles.includes(r))) {
      missingRoles.push(ATTENDANCE_APP_ROLES.meetingLookup[0]);
    }
    if (!ATTENDANCE_APP_ROLES.artifacts.some((r) => roles.includes(r))) {
      missingRoles.push(ATTENDANCE_APP_ROLES.artifacts[0]);
    }
    steps.push({
      step: 'app_roles',
      ok: missingRoles.length === 0,
      detail: roles.length
        ? `Token carries: ${roles.join(', ')}`
        : 'Token carries no application roles at all',
      remedy: missingRoles.length
        ? `Azure portal, App registrations, the Nexus app, API permissions, Application permissions. Add ${missingRoles.join(' and ')}, then Grant admin consent.`
        : undefined,
    });

    // ── Calendar ───────────────────────────────────────────────────────────
    // Explicit +05:30 offsets. Graph reads an unzoned calendarView bound as UTC
    // while the Prefer header only shapes the response, so an offset is the one
    // form that is right under either reading.
    const graphStart = `${from}T00:00:00+05:30`;
    const graphEnd = `${nextDay(to)}T00:00:00+05:30`;

    let events: Awaited<ReturnType<typeof fetchGroupCalendarView>> = [];
    let calendarError: string | null = null;
    try {
      events = await fetchGroupCalendarView(appToken, classroom.ms_team_id, graphStart, graphEnd, 300);
    } catch (err) {
      calendarError = err instanceof Error ? err.message : String(err);
    }

    steps.push({
      step: 'calendar',
      ok: !calendarError,
      detail: calendarError
        ? `Group calendar read failed: ${calendarError}`
        : `${events.length} online meeting event(s) between ${from} and ${to}, ${events.filter((e) => e.isCancelled).length} cancelled`,
      remedy: calendarError
        ? 'The app-only token could not read the group calendar. Confirm the Nexus app has Calendars.Read or Group.Read.All application permission with admin consent.'
        : events.length === 0
          ? 'No calendar events in this window. Classes started with "Meet now" in the channel never create one, so check the Recordings folder count below before concluding no classes ran.'
          : undefined,
    });

    // ── Existing Nexus rows ────────────────────────────────────────────────
    const { data: existingRaw } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        'id, title, teams_meeting_id, teams_meeting_join_url, teams_meeting_url, scheduled_date, start_time, end_time, status, publish_state, recording_url, attendance_sync_status, attendance_sync_attempts, attendance_synced_at',
      )
      .eq('classroom_id', classroomId)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date');

    const existing = (existingRaw ?? []) as ExistingClassRow[];

    // ── Recordings ─────────────────────────────────────────────────────────
    let recordings: RecordingFile[] = [];
    let recordingsError: string | null = null;
    let resolvedChannelId: string | null = null;
    try {
      resolvedChannelId = classroom.ms_channel_id || (await resolveGeneralChannelId(appToken, classroom.ms_team_id));
      if (resolvedChannelId) {
        const all = await fetchRecordingsFromChannel(appToken, classroom.ms_team_id, resolvedChannelId, {
          maxItems: 500,
        });
        // Keep only files whose IST day falls inside the window, judged by the
        // filename stamp when there is one (the file is created after the class,
        // sometimes well after) and by createdDateTime otherwise.
        recordings = all.filter((f) => {
          const parsed = parseRecordingFileName(f.name);
          const day = parsed ? parsed.startedAt.substring(0, 10) : istDateOf(f.createdDateTime);
          return day >= from && day <= to;
        });
      }
    } catch (err) {
      recordingsError = err instanceof Error ? err.message : String(err);
    }

    steps.push({
      step: 'recordings',
      ok: !recordingsError,
      detail: recordingsError
        ? `Recordings folder read failed: ${recordingsError}`
        : `${recordings.length} recording file(s) in the window, out of the channel's Recordings folder`,
      remedy: recordingsError
        ? 'Confirm the Nexus app has Files.Read.All or Sites.Read.All application permission, and that the team has a General channel.'
        : undefined,
    });

    const { rows, orphans } = planBackfill(events, recordings, existing);

    steps.push({
      step: 'nexus_rows',
      ok: true,
      detail:
        `${existing.length} Nexus class(es) already in the window. ` +
        `${rows.filter((r) => r.action === 'import').length} would be imported, ` +
        `${rows.filter((r) => r.action.startsWith('exists')).length} already exist, ` +
        `${orphans.length} Nexus class(es) have no matching Teams event.`,
    });

    // ── Attendance strategies, on one sample class ─────────────────────────
    const sampleId = params.get('class_id');
    let sampleQuery = supabase
      .from('nexus_scheduled_classes')
      .select(`${CLASS_SYNC_COLUMNS}, title`)
      .eq('classroom_id', classroomId)
      .not('teams_meeting_id', 'is', null);

    sampleQuery = sampleId
      ? sampleQuery.eq('id', sampleId)
      : sampleQuery
          .gte('scheduled_date', from)
          .lte('scheduled_date', to)
          .order('scheduled_date', { ascending: false })
          .limit(1);

    const { data: sampleRows } = await sampleQuery;
    const sample = Array.isArray(sampleRows) ? sampleRows[0] : sampleRows;

    if (!sample) {
      steps.push({
        step: 'attendance',
        ok: false,
        detail: 'No class in this window has a Teams meeting linked, so attendance cannot be probed.',
        remedy: 'Import the classes first, then run this probe again to test attendance.',
      });
      return respond(steps, {
        classroom,
        window: { from, to, graph_start: graphStart, graph_end: graphEnd },
        activeStudents: activeStudents ?? 0,
        resolvedChannelId,
        events,
        recordings,
        rows,
        orphans,
      });
    }

    const joinUrl = sample.teams_meeting_join_url || sample.teams_meeting_url || null;
    const organizerOid =
      sample.organizer_ms_oid || (joinUrl ? parseChannelJoinUrl(joinUrl).organizerOid : null);
    const callerOid = msUser.oid;
    const callerIsOrganizer =
      !!organizerOid && callerOid.toLowerCase() === organizerOid.toLowerCase();

    // Both the delegated-path advice and the access-policy remedy have to name a
    // person: "ask oid f51c6475-..." is not an instruction anyone can act on.
    const organizerUser = organizerOid
      ? (
          await supabase
            .from('users')
            .select('name, email, ms_teams_email')
            // ilike, not eq: an oid lifted out of a join URL carries whatever
            // casing Teams wrote, and PostgREST eq is case sensitive.
            .ilike('ms_oid', escapeIlike(organizerOid))
            .maybeSingle()
        ).data
      : null;
    const organizerUpn: string | null =
      organizerUser?.ms_teams_email || organizerUser?.email || null;
    const organizerLabel = organizerUser?.name
      ? `${organizerUser.name}${organizerUpn ? ` (${organizerUpn})` : ''}`
      : (organizerUpn ?? organizerOid);

    steps.push({
      step: 'delegated_token',
      ok: callerIsOrganizer,
      detail: callerIsOrganizer
        ? `You (${msUser.email}) organized this meeting, so your own token can read its attendance without any Teams policy.`
        : `This meeting was organized by ${organizerLabel ?? 'someone we could not identify'}, not by you (${msUser.email ?? callerOid}).`,
      remedy: callerIsOrganizer
        ? undefined
        : organizerOid
          ? `Only the organizer's own token can use /me/onlineMeetings. Ask ${organizerLabel} to sign into Nexus and run this probe, before concluding anything about the delegated path.`
          : 'The join URL carries no Oid in its context param, so we cannot tell who organized it.',
    });

    const probe = await probeAttendanceStrategies({
      appToken,
      delegatedToken: extractBearerToken(request.headers.get('Authorization')),
      callerOid,
      organizerOid,
      joinUrl,
      knownOnlineMeetingId: sample.online_meeting_id,
    });

    steps.push({
      step: 'attendance',
      ok: !!probe.winner,
      detail: probe.verdict,
      remedy: probe.winner ? undefined : buildNoAttendanceRouteRemedy(organizerUpn),
    });

    return respond(steps, {
      classroom,
      window: { from, to, graph_start: graphStart, graph_end: graphEnd },
      activeStudents: activeStudents ?? 0,
      resolvedChannelId,
      events,
      recordings,
      rows,
      orphans,
      sample: {
        class_id: sample.id,
        title: sample.title,
        scheduled_date: sample.scheduled_date,
        join_url: joinUrl,
        organizer_oid: organizerOid,
        caller_oid: callerOid,
        caller_is_organizer: probe.callerIsOrganizer,
        attempts: probe.attempts,
        winner: probe.winner?.key ?? null,
        verdict: probe.verdict,
      },
    });
  } catch (err) {
    return errorResponse(err, 'Backfill probe failed');
  }
}

function respond(
  steps: Step[],
  ctx: {
    classroom: any;
    window: { from: string; to: string; graph_start?: string; graph_end?: string };
    activeStudents?: number;
    resolvedChannelId?: string | null;
    events?: Array<{ id: string; subject: string; start: string; end: string; isCancelled: boolean; joinUrl: string | null }>;
    recordings?: RecordingFile[];
    rows?: Array<{ action: string; existing_class_id: string | null; matched_on: string | null }>;
    orphans?: Array<{ id: string; title: string; scheduled_date: string }>;
    sample?: unknown;
  },
) {
  const blocking = steps.find((s) => !s.ok);
  const rows = ctx.rows ?? [];

  return NextResponse.json({
    ok: !blocking,
    blocking_step: blocking?.step ?? null,
    classroom: ctx.classroom
      ? {
          id: ctx.classroom.id,
          name: ctx.classroom.name,
          type: ctx.classroom.type,
          ms_team_id: ctx.classroom.ms_team_id,
          ms_channel_id: ctx.classroom.ms_channel_id,
          resolved_channel_id: ctx.resolvedChannelId ?? null,
          is_archived: ctx.classroom.is_archived,
          active_students: ctx.activeStudents ?? 0,
        }
      : null,
    window: ctx.window,
    calendar: {
      count: ctx.events?.length ?? 0,
      cancelled: ctx.events?.filter((e) => e.isCancelled).length ?? 0,
      events:
        ctx.events?.map((e) => ({
          id: e.id,
          subject: e.subject,
          start: e.start,
          end: e.end,
          isCancelled: e.isCancelled,
          thread: e.joinUrl?.includes('thread.tacv2')
            ? 'tacv2'
            : e.joinUrl?.includes('thread.v2')
              ? 'v2'
              : 'none',
        })) ?? [],
    },
    nexus: {
      would_import: rows.filter((r) => r.action === 'import').length,
      already_exist: rows.filter((r) => r.action.startsWith('exists')).length,
      matched_by_event_id: rows.filter((r) => r.matched_on === 'event_id').length,
      matched_by_join_url: rows.filter((r) => r.matched_on === 'join_url').length,
      matched_by_slot: rows.filter((r) => r.matched_on === 'slot').length,
      orphans: ctx.orphans?.length ?? 0,
    },
    recordings: {
      count: ctx.recordings?.length ?? 0,
      files: ctx.recordings?.map((f) => ({ name: f.name, createdDateTime: f.createdDateTime })) ?? [],
    },
    sample: ctx.sample ?? null,
    steps,
  });
}
