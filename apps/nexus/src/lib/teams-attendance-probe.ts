/**
 * Read-only probe of every way Graph might hand us a channel meeting's
 * attendance, run all at once so the answer is a table rather than a guess.
 *
 * Why this exists as its own thing rather than a call to `syncClassAttendance`:
 * that function always finishes through `recordOutcome`, which increments
 * `attendance_sync_attempts`. Six failures and the nightly cron gives up on the
 * class for good. A diagnostic must never spend those.
 *
 * Why every strategy runs even after one succeeds: the point is to learn which
 * paths work in this tenant, not to get one answer. App-only lookups are known
 * to 403 with `No application access policy found for this app <id> on the user`
 * until a Teams administrator runs Grant-CsApplicationAccessPolicy. The open
 * question this endpoint was built to settle is whether the organizer's own
 * delegated token can reach a channel-thread (@thread.tacv2) meeting at all,
 * since the onlineMeetings collection is keyed on meeting threads (@thread.v2).
 *
 * Graph bodies are recorded VERBATIM. Commit cccade6d was spent undoing a
 * "helpful" reclassification that replaced Microsoft's explicit access-policy
 * message with a generic one and sent debugging to the wrong endpoint.
 */

const GRAPH_V1 = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';

/** Graph error bodies are kept whole up to this length, never reworded. */
const BODY_LIMIT = 600;

export interface ProbeAttempt {
  key: string;
  label: string;
  /** Full Graph URL. Tokens are never part of a URL, so this is safe to show. */
  url: string;
  identity: 'app-only' | 'delegated';
  status: number | null;
  ok: boolean;
  /** Set when the attempt was deliberately not made, with the reason. */
  skipped?: string;
  meetingId?: string | null;
  reportCount?: number | null;
  /** Verbatim Graph response body, truncated only by length. */
  body: string;
}

export interface AttendanceProbeInput {
  appToken: string | null;
  delegatedToken: string | null;
  callerOid: string | null;
  organizerOid: string | null;
  joinUrl: string | null;
  knownOnlineMeetingId: string | null;
}

export interface AttendanceProbeResult {
  attempts: ProbeAttempt[];
  winner: ProbeAttempt | null;
  verdict: string;
  callerIsOrganizer: boolean;
}

/**
 * Pull the parts of a channel meeting join URL apart.
 *
 * Shape: /l/meetup-join/<url-encoded thread id>/<epoch ms>?context={"Tid":…,"Oid":…}
 * The epoch segment is the channel meeting's chatInfo.messageId, which is the
 * only thing distinguishing two meetings that share one channel thread.
 */
export function parseChannelJoinUrl(joinUrl: string): {
  threadId: string | null;
  messageId: string | null;
  organizerOid: string | null;
  tenantId: string | null;
} {
  const empty = { threadId: null, messageId: null, organizerOid: null, tenantId: null };
  if (!joinUrl) return empty;

  const pathMatch = joinUrl.match(/\/l\/meetup-join\/([^/?#]+)(?:\/([^/?#]+))?/i);
  let threadId: string | null = null;
  let messageId: string | null = null;
  if (pathMatch) {
    try {
      threadId = decodeURIComponent(pathMatch[1]);
    } catch {
      threadId = pathMatch[1];
    }
    messageId = pathMatch[2] ? decodeURIComponent(pathMatch[2]) : null;
    if (messageId && !/^\d+$/.test(messageId)) messageId = null;
  }

  let organizerOid: string | null = null;
  let tenantId: string | null = null;
  const contextMatch = joinUrl.match(/[?&]context=([^&]+)/i);
  if (contextMatch) {
    try {
      const ctx = JSON.parse(decodeURIComponent(contextMatch[1]));
      organizerOid = ctx?.Oid ?? null;
      tenantId = ctx?.Tid ?? null;
    } catch {
      const oid = joinUrl.match(/%22Oid%22%3a%22([^%]+)%22/i);
      organizerOid = oid ? oid[1] : null;
    }
  }

  return { threadId, messageId, organizerOid, tenantId };
}

const odataQuote = (v: string) => v.replace(/'/g, "''");

async function attempt(
  spec: { key: string; label: string; url: string; identity: 'app-only' | 'delegated'; token: string | null },
): Promise<ProbeAttempt> {
  const base: ProbeAttempt = {
    key: spec.key,
    label: spec.label,
    url: spec.url,
    identity: spec.identity,
    status: null,
    ok: false,
    body: '',
  };

  if (!spec.token) {
    return { ...base, skipped: `No ${spec.identity} token available` };
  }

  try {
    const res = await fetch(spec.url, { headers: { Authorization: `Bearer ${spec.token}` } });
    const text = (await res.text().catch(() => '')).slice(0, BODY_LIMIT);
    let meetingId: string | null = null;
    let reportCount: number | null = null;
    if (res.ok) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.value)) {
          meetingId = parsed.value[0]?.id ?? null;
          reportCount = parsed.value.length;
        } else if (parsed?.id) {
          meetingId = parsed.id;
        }
      } catch {
        // A 200 whose body will not parse is still worth reporting as-is.
      }
    }
    return { ...base, status: res.status, ok: res.ok, body: text, meetingId, reportCount };
  } catch (err) {
    return { ...base, body: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run every candidate lookup and report all of them.
 * Makes only GET requests and writes nothing anywhere.
 */
export async function probeAttendanceStrategies(
  input: AttendanceProbeInput,
): Promise<AttendanceProbeResult> {
  const { appToken, delegatedToken, callerOid, joinUrl, knownOnlineMeetingId } = input;
  const parsed = joinUrl ? parseChannelJoinUrl(joinUrl) : null;
  const organizerOid = input.organizerOid || parsed?.organizerOid || null;
  const callerIsOrganizer =
    !!callerOid && !!organizerOid && callerOid.toLowerCase() === organizerOid.toLowerCase();

  const attempts: ProbeAttempt[] = [];
  const joinFilter = joinUrl ? `JoinWebUrl eq '${odataQuote(joinUrl)}'` : null;
  const threadFilter = parsed?.threadId ? `chatInfo/threadId eq '${odataQuote(parsed.threadId)}'` : null;

  // 1. The path production uses today. Expected to 403 until a Teams admin runs
  //    Grant-CsApplicationAccessPolicy.
  if (organizerOid && joinFilter) {
    attempts.push(
      await attempt({
        key: 'app_joinurl',
        label: 'App-only, organizer meetings filtered by join URL',
        url: `${GRAPH_V1}/users/${organizerOid}/onlineMeetings?$filter=${encodeURIComponent(joinFilter)}&$select=id`,
        identity: 'app-only',
        token: appToken,
      }),
    );
  }

  // 2. The question this endpoint exists to answer. Only the organizer's own
  //    token can read /me, so anyone else gets a recorded skip rather than a
  //    misleading 403.
  if (joinFilter) {
    if (!callerIsOrganizer) {
      attempts.push({
        key: 'me_joinurl',
        label: 'Delegated /me, filtered by join URL',
        url: `${GRAPH_V1}/me/onlineMeetings?$filter=${encodeURIComponent(joinFilter)}&$select=id`,
        identity: 'delegated',
        status: null,
        ok: false,
        skipped: 'The signed-in user is not this meeting\'s organizer, so /me cannot contain it.',
        body: '',
      });
    } else {
      attempts.push(
        await attempt({
          key: 'me_joinurl',
          label: 'Delegated /me, filtered by join URL',
          url: `${GRAPH_V1}/me/onlineMeetings?$filter=${encodeURIComponent(joinFilter)}&$select=id`,
          identity: 'delegated',
          token: delegatedToken,
        }),
      );
    }
  }

  // 3 and 4. chatInfo lookups. A channel meeting's chat thread is the channel
  //    thread, so if the collection is reachable by thread at all this is how.
  if (threadFilter && callerIsOrganizer) {
    attempts.push(
      await attempt({
        key: 'me_chatinfo_v1',
        label: 'Delegated /me, filtered by channel thread id',
        url: `${GRAPH_V1}/me/onlineMeetings?$filter=${encodeURIComponent(threadFilter)}&$select=id`,
        identity: 'delegated',
        token: delegatedToken,
      }),
    );

    if (parsed?.messageId) {
      const precise = `${threadFilter} and chatInfo/messageId eq '${odataQuote(parsed.messageId)}'`;
      attempts.push(
        await attempt({
          key: 'me_chatinfo_msg_beta',
          label: 'Delegated /me on beta, thread id plus message id',
          url: `${GRAPH_BETA}/me/onlineMeetings?$filter=${encodeURIComponent(precise)}&$select=id`,
          identity: 'delegated',
          token: delegatedToken,
        }),
      );
    }
  }

  // 5. Same filter shape, app-only. Separates "the policy is missing" from
  //    "that filter is not supported here".
  if (threadFilter && organizerOid) {
    attempts.push(
      await attempt({
        key: 'app_chatinfo',
        label: 'App-only, filtered by channel thread id',
        url: `${GRAPH_V1}/users/${organizerOid}/onlineMeetings?$filter=${encodeURIComponent(threadFilter)}&$select=id`,
        identity: 'app-only',
        token: appToken,
      }),
    );
  }

  // 6. If a previous sync already cached the meeting id, the lookup can be
  //    skipped entirely, which is a materially different permission surface.
  if (knownOnlineMeetingId) {
    if (callerIsOrganizer) {
      attempts.push(
        await attempt({
          key: 'cached_reports_delegated',
          label: 'Delegated attendance reports on the cached meeting id',
          url: `${GRAPH_V1}/me/onlineMeetings/${knownOnlineMeetingId}/attendanceReports`,
          identity: 'delegated',
          token: delegatedToken,
        }),
      );
    }
    if (organizerOid) {
      attempts.push(
        await attempt({
          key: 'cached_reports_app',
          label: 'App-only attendance reports on the cached meeting id',
          url: `${GRAPH_V1}/users/${organizerOid}/onlineMeetings/${knownOnlineMeetingId}/attendanceReports`,
          identity: 'app-only',
          token: appToken,
        }),
      );
    }
  }

  // 7. Whatever resolved a meeting id, prove the artifact permission too.
  //    Resolving a meeting and being allowed to read its attendance are two
  //    different grants, and only this call distinguishes them.
  const resolver = attempts.find((a) => a.ok && a.meetingId);
  if (resolver) {
    const base =
      resolver.identity === 'delegated'
        ? `${GRAPH_V1}/me/onlineMeetings/${resolver.meetingId}`
        : `${GRAPH_V1}/users/${organizerOid}/onlineMeetings/${resolver.meetingId}`;
    attempts.push(
      await attempt({
        key: 'winner_reports',
        label: `Attendance reports via ${resolver.key}`,
        url: `${base}/attendanceReports`,
        identity: resolver.identity,
        token: resolver.identity === 'delegated' ? delegatedToken : appToken,
      }),
    );
  }

  const reportsAttempt = attempts.find(
    (a) => a.ok && (a.key === 'winner_reports' || a.key.startsWith('cached_reports')),
  );
  const winner = reportsAttempt ?? resolver ?? null;

  return { attempts, winner, verdict: buildVerdict(attempts, winner, callerIsOrganizer), callerIsOrganizer };
}

function buildVerdict(
  attempts: ProbeAttempt[],
  winner: ProbeAttempt | null,
  callerIsOrganizer: boolean,
): string {
  if (winner) {
    const reports = winner.reportCount;
    return (
      `${winner.label} worked (HTTP ${winner.status}` +
      (reports != null ? `, ${reports} item(s)` : '') +
      `). Wire the attendance sync to this path.`
    );
  }

  const emptyDelegated = attempts.find(
    (a) => a.identity === 'delegated' && a.ok && a.reportCount === 0,
  );
  if (emptyDelegated) {
    return (
      'The organizer\'s own token was accepted but matched no meeting. That is the ' +
      'answer to the open question: a channel meeting is not addressable through ' +
      '/me/onlineMeetings, because that collection is keyed on meeting threads ' +
      '(@thread.v2) and these are channel threads (@thread.tacv2). The only ' +
      'remaining route is the app-only one, which needs the Teams application ' +
      'access policy.'
    );
  }

  if (!callerIsOrganizer) {
    return (
      'Every delegated strategy was skipped because the signed-in user is not the ' +
      'meeting organizer. Sign in as the organizer and run this again before ' +
      'concluding anything about the delegated path.'
    );
  }

  const worst = attempts.find((a) => a.status === 403) ?? attempts.find((a) => !a.ok && a.status);
  return worst
    ? `No strategy resolved this meeting. The most informative refusal was ${worst.key} (HTTP ${worst.status}): ${worst.body}`
    : 'No strategy could be attempted. Check the tokens and the stored join URL.';
}
