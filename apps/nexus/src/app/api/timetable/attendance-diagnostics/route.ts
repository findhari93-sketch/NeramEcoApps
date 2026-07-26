import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyTeacher } from '@/lib/verify-teacher';
import { errorResponse } from '@/lib/api-errors';
import { getAppOnlyToken, decodeAppTokenRoles, ATTENDANCE_APP_ROLES } from '@/lib/graph-app-token';
import { resolveOrganizerOid } from '@/lib/teams-online-meeting';
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
      .select(`${CLASS_SYNC_COLUMNS}, title, end_time, attendance_sync_status, attendance_sync_detail`)
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

    steps.push({
      step: 'organizer',
      ok: !!organizerOid,
      detail: organizerOid
        ? `Resolved organizer ${organizerOid}${cls.organizer_ms_oid ? ' (cached on the class)' : ' (from the join URL)'}`
        : 'Could not resolve an organizer from the join URL, organizer_email, or teacher_id',
      remedy: organizerOid
        ? undefined
        : 'The join URL carries no Oid in its context param. Set organizer_email on the class, or recreate the meeting from Nexus.',
    });
    if (!organizerOid) return respond(steps, cls);

    // 5. Access policy. With the roles confirmed present above, a 403 here can
    // only be the Teams application access policy.
    const policyRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizerOid}/onlineMeetings?$top=1`,
      { headers: { Authorization: `Bearer ${appToken}` } },
    );
    const policyBody = policyRes.ok ? '' : (await policyRes.text().catch(() => '')).slice(0, 400);
    const policyOk = policyRes.ok || policyRes.status === 400; // 400 = odd filter, but access was allowed

    steps.push({
      step: 'access_policy',
      ok: policyOk,
      detail: policyOk
        ? `Graph allowed an app-only read of this organizer's meetings (${policyRes.status})`
        : `Graph refused: ${policyRes.status} ${policyBody}`,
      remedy: policyOk
        ? undefined
        : [
            'Run as a Teams administrator:',
            '  Connect-MicrosoftTeams',
            `  New-CsApplicationAccessPolicy -Identity Nexus-Attendance-Read -AppIds "${process.env.AZ_CLIENT_ID}" -Description "Nexus reads Teams meeting attendance"`,
            '  Grant-CsApplicationAccessPolicy -PolicyName Nexus-Attendance-Read -Global',
            'Propagation can take 30 minutes or more.',
          ].join('\n'),
    });
    if (!policyOk) return respond(steps, cls);

    // 6. Meeting lookup
    const filter = `JoinWebUrl eq '${(joinUrl ?? '').replace(/'/g, "''")}'`;
    const meetingRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizerOid}/onlineMeetings?$filter=${encodeURIComponent(filter)}&$select=id`,
      { headers: { Authorization: `Bearer ${appToken}` } },
    );
    const meetingData = meetingRes.ok ? await meetingRes.json() : null;
    const meetingId: string | null = meetingData?.value?.[0]?.id ?? null;

    steps.push({
      step: 'meeting_lookup',
      ok: !!meetingId,
      detail: meetingId
        ? `Resolved onlineMeeting ${meetingId}`
        : meetingRes.ok
          ? 'Graph matched no meeting for this join URL'
          : `Graph returned ${meetingRes.status} ${(await meetingRes.text().catch(() => '')).slice(0, 300)}`,
      remedy: meetingId
        ? undefined
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
      title: cls.title,
      scheduled_date: cls.scheduled_date,
      teams_meeting_scope_hint: cls.teams_meeting_id?.startsWith('AAMk') ? 'channel_meeting' : 'online_meeting',
      last_sync_status: cls.attendance_sync_status ?? null,
      last_sync_detail: cls.attendance_sync_detail ?? null,
    },
    steps,
  });
}
