import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyTeacher } from '@/lib/verify-teacher';
import { errorResponse } from '@/lib/api-errors';
import {
  getAppOnlyToken,
  decodeAppTokenRoles,
  ATTENDANCE_APP_ROLES,
  TRANSCRIPT_APP_ROLES,
} from '@/lib/graph-app-token';
import { resolveOrganizerOid, isChannelMeeting, escapeIlike } from '@/lib/teams-online-meeting';
import { buildAccessPolicyRemedy } from '@/lib/teams-access-policy';
import { CLASS_SYNC_COLUMNS } from '@/lib/attendance-sync';

/**
 * GET /api/timetable/attendance-diagnostics?class_id={id}
 *
 * Answers, in one call, the question that otherwise takes a 502 and a guess:
 * is Teams attendance actually readable, and if not, which specific thing is
 * missing?
 *
 * Reading attendance for a channel meeting needs three things lined up, only one
 * of which lives in this repo:
 *   1. AZ_* credentials (here)
 *   2. Graph APPLICATION permissions OnlineMeetings.Read.All and
 *      OnlineMeetingArtifact.Read.All, with admin consent (Azure portal)
 *   3. A Teams application access policy granting this app rights over the
 *      meeting's organizer (Teams PowerShell)
 *
 * Each step below reports ok/failed plus the exact remedy, so 2 and 3 stop being
 * indistinguishable. Read-only: it writes nothing.
 */

interface Step {
  step: string;
  ok: boolean;
  detail: string;
  remedy?: string;
}

export async function GET(request: NextRequest) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient() as any;
    const classId = request.nextUrl.searchParams.get('class_id');
    const steps: Step[] = [];

    // Default to the most recent class that actually has a meeting, so this is
    // usable with no arguments.
    let query = supabase
      .from('nexus_scheduled_classes')
      .select(
        `${CLASS_SYNC_COLUMNS}, title, end_time, attendance_sync_status, attendance_sync_detail, ` +
          'recording_url, recording_sync_status, recording_sync_attempts, recording_sync_detail',
      )
      .not('teams_meeting_id', 'is', null);

    query = classId
      ? query.eq('id', classId)
      : query.order('scheduled_date', { ascending: false }).limit(1);

    const { data: rows } = await query;
    const cls = Array.isArray(rows) ? rows[0] : rows;

    if (!cls) {
      return NextResponse.json(
        {
          ok: false,
          blocking_step: 'class',
          steps: [
            {
              step: 'class',
              ok: false,
              detail: classId
                ? 'That class does not exist, or has no Teams meeting linked.'
                : 'No class in the system has a Teams meeting linked.',
            },
          ],
        },
        { status: 404 },
      );
    }

    // 1. Credentials
    const missingEnv = ['AZ_CLIENT_ID', 'AZ_CLIENT_SECRET', 'AZ_TENANT_ID'].filter(
      (key) => !process.env[key],
    );
    steps.push({
      step: 'env',
      ok: missingEnv.length === 0,
      detail: missingEnv.length ? `Missing: ${missingEnv.join(', ')}` : 'AZ_CLIENT_ID, AZ_CLIENT_SECRET, AZ_TENANT_ID all present',
      remedy: missingEnv.length
        ? `Set ${missingEnv.join(', ')} on the Nexus Vercel project (production and preview).`
        : undefined,
    });
    if (missingEnv.length) return respond(steps, cls);

    // 2. App-only token
    let appToken: string;
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
      return respond(steps, cls);
    }

    // 3. Application permissions, read straight off the token's roles claim.
    // This is definitive: no Graph call needed, and no error-string guessing.
    const roles = decodeAppTokenRoles(appToken);
    const hasLookup = ATTENDANCE_APP_ROLES.meetingLookup.some((r) => roles.includes(r));
    const hasArtifacts = ATTENDANCE_APP_ROLES.artifacts.some((r) => roles.includes(r));
    const missingRoles: string[] = [];
    if (!hasLookup) missingRoles.push(ATTENDANCE_APP_ROLES.meetingLookup[0]);
    if (!hasArtifacts) missingRoles.push(ATTENDANCE_APP_ROLES.artifacts[0]);

    steps.push({
      step: 'app_roles',
      ok: missingRoles.length === 0,
      detail: roles.length ? `Token carries: ${roles.join(', ')}` : 'Token carries no application roles at all',
      remedy: missingRoles.length
        ? `Azure portal, App registrations, the Nexus app, API permissions, Add a permission, Microsoft Graph, Application permissions. Add ${missingRoles.join(' and ')}, then Grant admin consent.`
        : undefined,
    });
    if (missingRoles.length) return respond(steps, cls);

    // 4. Organizer
    const joinUrl = cls.teams_meeting_join_url || cls.teams_meeting_url || null;
    const organizerOid =
      cls.organizer_ms_oid ||
      (await resolveOrganizerOid(supabase, {
        joinUrl,
        organizerEmail: cls.organizer_email,
        teacherId: cls.teacher_id,
      }));

    // Name the organizer wherever we can. The access-policy remedy has to be
    // granted against a sign-in name, and a raw oid leaves whoever runs the
    // PowerShell to go and look it up themselves.
    const organizer = organizerOid
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
    const organizerUpn: string | null = organizer?.ms_teams_email || organizer?.email || null;

    steps.push({
      step: 'organizer',
      ok: !!organizerOid,
      detail: organizerOid
        ? `Resolved organizer ${organizer?.name ? `${organizer.name} (${organizerUpn ?? organizerOid})` : organizerOid}${cls.organizer_ms_oid ? ', cached on the class' : ', from the join URL'}`
        : 'Could not resolve an organizer from the join URL, organizer_email, or teacher_id',
      remedy: organizerOid
        ? undefined
        : 'The join URL carries no Oid in its context param. Set organizer_email on the class, or recreate the meeting from Nexus.',
    });
    if (!organizerOid) return respond(steps, cls);

    // 5 and 6. Access policy AND meeting lookup, from ONE Graph call.
    //
    // They share a call because a filter is the only way to read this collection:
    // an unfiltered `?$top=1` returns 400 `InvalidArgument: One of the required
    // parameters to lookup meeting by QueryOptions is null or empty`, and it does
    // so BEFORE Graph evaluates any policy. This endpoint used to probe with
    // `?$top=1` and treat that 400 as a pass, so it reported a healthy access
    // policy while the real 403 was one step further on. Verified against the
    // live tenant on 2026-07-26.
    if (!joinUrl) {
      steps.push({
        step: 'access_policy',
        ok: false,
        detail: 'No join URL stored on this class, so the meeting cannot be looked up at all.',
        remedy: 'Recreate the meeting from Nexus so the join URL is captured.',
      });
      return respond(steps, cls);
    }

    const filter = `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
    const lookupRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizerOid}/onlineMeetings?$filter=${encodeURIComponent(filter)}&$select=id`,
      { headers: { Authorization: `Bearer ${appToken}` } },
    );
    const lookupBody = lookupRes.ok ? '' : (await lookupRes.text().catch(() => '')).slice(0, 400);

    // With the roles confirmed present above, a 403 here can only be the policy.
    const policyRefused = lookupRes.status === 403;

    steps.push({
      step: 'access_policy',
      ok: !policyRefused,
      detail: policyRefused
        ? `Graph refused: ${lookupRes.status} ${lookupBody}`
        : `Graph allowed an app-only read of this organizer's meetings (${lookupRes.status})`,
      remedy: policyRefused ? buildAccessPolicyRemedy(organizerUpn) : undefined,
    });
    if (policyRefused) return respond(steps, cls);

    const lookupData = lookupRes.ok ? await lookupRes.json().catch(() => null) : null;
    const meetingId: string | null = lookupData?.value?.[0]?.id ?? null;
    const isChannelUrl = joinUrl.includes('thread.tacv2');

    steps.push({
      step: 'meeting_lookup',
      ok: !!meetingId,
      detail: meetingId
        ? `Resolved onlineMeeting ${meetingId}`
        : lookupRes.ok
          ? `Graph matched no meeting for this join URL (${isChannelUrl ? 'channel thread' : 'standalone meeting thread'})`
          : `Graph returned ${lookupRes.status} ${lookupBody}`,
      remedy: meetingId
        ? undefined
        : isChannelUrl
          ? 'This is a channel meeting (19:...@thread.tacv2). The onlineMeetings collection is keyed on meeting threads (@thread.v2), so a channel meeting may not be resolvable by join URL at all. Compare against a standalone meeting before assuming the meeting is missing.'
          : 'The meeting may have been deleted in Teams, or the stored join URL is not the canonical one. Recreate the meeting from Nexus.',
    });
    if (!meetingId) return respond(steps, cls);

    // 7. Attendance reports. Note the two-call shape is deliberate: Graph does
    // NOT support GET attendanceReports/{id} for channel meetings, only LIST,
    // and every class meeting here is a channel meeting.
    const reportsRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizerOid}/onlineMeetings/${meetingId}/attendanceReports`,
      { headers: { Authorization: `Bearer ${appToken}` } },
    );

    if (!reportsRes.ok) {
      steps.push({
        step: 'reports',
        ok: false,
        detail: `Graph returned ${reportsRes.status} ${(await reportsRes.text().catch(() => '')).slice(0, 300)}`,
        remedy: 'Attendance artifacts are refused even though the meeting resolved. Confirm OnlineMeetingArtifact.Read.All has admin consent.',
      });
      return respond(steps, cls);
    }

    const reportsData = await reportsRes.json();
    const reports = (reportsData.value ?? []) as Array<{
      id: string;
      meetingStartDateTime?: string;
      meetingEndDateTime?: string;
      totalParticipantCount?: number;
    }>;

    steps.push({
      step: 'reports',
      ok: reports.length > 0,
      detail:
        reports.length > 0
          ? `${reports.length} report(s): ${reports
              .map((r) => `${r.meetingStartDateTime ?? 'undated'} (${r.totalParticipantCount ?? '?'} participants)`)
              .join('; ')}`
          : 'Teams has published no attendance report for this meeting',
      remedy:
        reports.length > 0
          ? undefined
          : 'The meeting may not have taken place, or the report is not published yet. Graph also returns at most the 50 most recent reports per meeting, so older occurrences of a recurring meeting are unreachable.',
    });

    // 8. Transcripts, which are a SEPARATE permission from attendance artifacts
    // and have their own failure. Checked here rather than left to be guessed
    // at, because the symptom a teacher sees is "Generate from the class does
    // nothing automatically" and the cause is one missing Azure grant.
    const hasTranscriptRole = TRANSCRIPT_APP_ROLES.some((r) => roles.includes(r));
    steps.push({
      step: 'transcript_role',
      ok: hasTranscriptRole,
      detail: hasTranscriptRole
        ? `Token carries ${TRANSCRIPT_APP_ROLES[0]}`
        : `Token does NOT carry ${TRANSCRIPT_APP_ROLES[0]}, so the nightly transcript sweep can never read one. Transcripts only appear when a teacher presses Generate, which uses their own sign-in.`,
      remedy: hasTranscriptRole
        ? undefined
        : `Azure portal, App registrations, the Nexus app, API permissions, Add a permission, Microsoft Graph, Application permissions. Add ${TRANSCRIPT_APP_ROLES[0]}, then Grant admin consent. Afterwards reset the stuck rows so the sweep retries: update nexus_class_transcripts set status='pending', attempts=0 where status <> 'ok'.`,
    });

    // 9. The call itself. Worth making even without the role, because it proves
    // the diagnosis rather than inferring it, and because a 403 with the role
    // present means the access policy does not extend to transcripts.
    const transcriptsRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizerOid}/onlineMeetings/${meetingId}/transcripts`,
      { headers: { Authorization: `Bearer ${appToken}` } },
    );
    const transcriptBody = transcriptsRes.ok
      ? ''
      : (await transcriptsRes.text().catch(() => '')).slice(0, 300);
    const transcriptCount = transcriptsRes.ok
      ? ((await transcriptsRes.json().catch(() => null))?.value ?? []).length
      : 0;

    steps.push({
      step: 'transcripts',
      ok: transcriptsRes.ok,
      detail: transcriptsRes.ok
        ? transcriptCount > 0
          ? `Graph listed ${transcriptCount} transcript(s) for this meeting`
          : 'Graph allowed the read and listed nothing. Teams did not record a transcript for this session.'
        : `Graph returned ${transcriptsRes.status} ${transcriptBody}`,
      remedy: transcriptsRes.ok
        ? undefined
        : transcriptsRes.status === 403 && hasTranscriptRole
          ? 'The permission is granted but Teams still refuses. The application access policy covering this organizer may predate the transcript grant; re-run Grant-CsApplicationAccessPolicy for them.'
          : transcriptsRes.status === 403
            ? 'Same fix as the step above: the missing application permission.'
            : 'Unexpected. Check whether the meeting still exists in Teams.',
    });

    return respond(steps, cls);
  } catch (err) {
    return errorResponse(err, 'Diagnostics failed');
  }
}

function respond(steps: Step[], cls: any) {
  const blocking = steps.find((s) => !s.ok);
  return NextResponse.json({
    ok: !blocking,
    blocking_step: blocking?.step ?? null,
    class: {
      id: cls.id,
      // Carried so this endpoint is self-sufficient: it is the only staff-facing
      // route that finds a meeting-bearing class without needing a classroom
      // enrollment, which makes it the natural starting point for anything that
      // has to locate one (tooling and tests included).
      classroom_id: cls.classroom_id,
      title: cls.title,
      scheduled_date: cls.scheduled_date,
      // Keyed on the join URL's thread type, with the id prefix only as a
      // fallback. The previous `startsWith('AAMk')` test misclassified every
      // production row whose Outlook event id begins `AQMk`, which is most of
      // them, and reported a channel meeting as a standalone one.
      teams_meeting_scope_hint: isChannelMeeting(
        cls.teams_meeting_id ?? null,
        cls.teams_meeting_join_url || cls.teams_meeting_url || null,
      )
        ? 'channel_meeting'
        : 'online_meeting',
      last_sync_status: cls.attendance_sync_status ?? null,
      last_sync_detail: cls.attendance_sync_detail ?? null,
      // Reported alongside the class rather than as a step in the chain. The
      // recording hunt is a separate sweep with its own attempt counter and its
      // own terminal state, so a class with no recording must not read as the
      // thing blocking attendance.
      recording: {
        has_url: !!cls.recording_url,
        status: cls.recording_sync_status ?? null,
        attempts: cls.recording_sync_attempts ?? 0,
        detail: cls.recording_sync_detail ?? null,
      },
    },
    steps,
  });
}
