import { getAppOnlyToken } from '@/lib/graph-app-token';

/**
 * Extract the organizer OID from a Teams join URL's embedded context param
 * (`{"Tid":"...","Oid":"..."}`). This is the most reliable organizer source:
 * it needs no DB lookup or sync freshness, since Teams stamps it into the URL
 * itself at meeting-creation time.
 */
export function extractOidFromJoinUrl(joinUrl: string): string | null {
  try {
    const url = new URL(joinUrl);
    const context = url.searchParams.get('context');
    if (!context) return null;
    const parsed = JSON.parse(context);
    return parsed.Oid || null;
  } catch {
    // Join URL might be encoded differently, try regex
    const match = joinUrl.match(/%22Oid%22%3a%22([a-f0-9-]+)%22/i);
    return match ? match[1] : null;
  }
}

/**
 * PostgREST treats `_` and `%` inside an `ilike` pattern as wildcards, so an
 * unescaped email like `hari_babu@x.com` would also match `hariXbabu@x.com`.
 */
export function escapeIlike(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1');
}

/**
 * Resolve the ms_oid to use as the organizer for app-only Graph artifact reads.
 *
 * Channel/group meetings are often organized by someone other than the
 * Nexus-assigned teacher, so this tries, in order of reliability:
 *   1. The oid embedded in the meeting's own join URL (no DB/sync dependency).
 *   2. The class's recorded Teams organizer email (from calendar sync),
 *      matched case-insensitively per Microsoft's UPN casing quirks.
 *   3. The assigned teacher's own ms_oid, for classes with no distinct
 *      Teams organizer on record.
 */
export async function resolveOrganizerOid(
  supabase: any,
  opts: { joinUrl?: string | null; organizerEmail?: string | null; teacherId?: string | null },
): Promise<string | null> {
  const { joinUrl, organizerEmail, teacherId } = opts;

  if (joinUrl) {
    const oid = extractOidFromJoinUrl(joinUrl);
    if (oid) return oid;
  }

  if (organizerEmail) {
    const { data } = await supabase
      .from('users')
      .select('ms_oid')
      .ilike('email', escapeIlike(organizerEmail))
      .maybeSingle();
    if (data?.ms_oid) return data.ms_oid;
  }

  if (teacherId) {
    const { data } = await supabase
      .from('users')
      .select('ms_oid')
      .eq('id', teacherId)
      .maybeSingle();
    if (data?.ms_oid) return data.ms_oid;
  }

  return null;
}

/**
 * Everything a caller needs to read a meeting's artifacts (attendance reports,
 * recordings, transcripts): the resolved onlineMeeting id, the Graph path prefix
 * to hang the artifact segment off, and the token that path must be called with.
 */
export interface ResolvedOnlineMeeting {
  meetingId: string;
  /** e.g. `me/onlineMeetings/{id}` or `users/{oid}/onlineMeetings/{id}`. */
  artifactBase: string;
  /** The token the artifactBase must be fetched with (delegated vs app-only). */
  token: string;
}

/**
 * Why a meeting lookup came back empty. The two Azure ones are the whole reason
 * this type exists: a missing app permission and a missing Teams application
 * access policy both surface as a 403, need completely different remediation,
 * and used to be swallowed by a bare `catch {}` so nobody could tell them apart.
 */
export type MeetingLookupFailure =
  | 'no_organizer'
  | 'meeting_not_found'
  | 'app_permission_missing'
  | 'access_policy_missing'
  /**
   * The DELEGATED lookup was refused because the signed-in user did not organize
   * the meeting (Teams error 3003). For our channel meetings that is the normal
   * case, not a misconfiguration, so it must never be reported as the reason.
   */
  | 'not_organizer'
  | 'graph_error';

export interface OnlineMeetingResolution {
  meeting: ResolvedOnlineMeeting | null;
  failure?: MeetingLookupFailure;
  /** Raw Graph status and body, for server logs and the diagnostics endpoint. */
  detail?: string;
}

interface LookupResult {
  id: string | null;
  failure?: MeetingLookupFailure;
  detail?: string;
}

/**
 * Map a Graph error response onto a remediable cause.
 *
 * `appOnly` is load-bearing, not decoration. A Teams application access policy
 * governs app-only reads of `users/{oid}/...` and has no bearing whatsoever on
 * the delegated `me/...` collection, so blaming it for a delegated 403 sends the
 * operator to the wrong console. Verified live against this tenant: the app-only
 * refusal reads `No application access policy found for this app <id> on the
 * user`, while the delegated one reads `3003: User does not have access to
 * lookup meeting`, which merely means the caller is not the organizer.
 */
function classifyGraphFailure(status: number, body: string, appOnly: boolean): MeetingLookupFailure {
  if (appOnly) {
    if (/Authorization_RequestDenied/i.test(body)) return 'app_permission_missing';
    if (/application\s*access\s*policy/i.test(body)) return 'access_policy_missing';
    if (status === 403) return 'access_policy_missing';
  } else if (status === 403) {
    return 'not_organizer';
  }
  if (status === 404) return 'meeting_not_found';
  return 'graph_error';
}

/**
 * Which of two failed attempts to report. Lower wins.
 *
 * App-only outcomes always beat delegated ones: app-only is the only path that
 * can succeed for a channel meeting, and Azure misconfigurations surface there
 * alone. This exists because the previous "keep the most actionable failure"
 * heuristic let the delegated attempt's 403 overwrite the app-only diagnosis,
 * which is how prod ended up storing the useless `me/onlineMeetings responded
 * 403 ... 3003` instead of Microsoft's explicit access-policy message.
 */
export function failureRank(failure: MeetingLookupFailure, appOnly: boolean): number {
  if (appOnly) {
    if (failure === 'app_permission_missing' || failure === 'access_policy_missing') return 0;
    if (failure === 'graph_error') return 1;
    return 2;
  }
  // A delegated "you are not the organizer" is expected noise here.
  return failure === 'not_organizer' ? 5 : 4;
}

/**
 * Is this a Teams *channel* meeting?
 *
 * The join URL's thread type is authoritative: `@thread.tacv2` is a channel
 * thread, `@thread.v2` is a standalone meeting thread. The stored id shape is
 * only a fallback for rows with no join URL, and it must cover both Outlook
 * event id prefixes: prod holds `AAMk…` and `AQMk…`, and checking only `AAMk`
 * misclassified the latter as a standalone meeting.
 */
export function isChannelMeeting(teamsMeetingId: string | null, joinUrl: string | null): boolean {
  if (joinUrl) {
    if (joinUrl.includes('thread.tacv2')) return true;
    if (joinUrl.includes('thread.v2')) return false;
  }
  return /^(AAMk|AQMk)/i.test(teamsMeetingId ?? '');
}

async function lookupByJoinUrl(
  base: string,
  token: string,
  joinUrl: string,
  appOnly: boolean,
): Promise<LookupResult> {
  const filter = `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/${base}?$filter=${encodeURIComponent(filter)}&$select=id`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        id: null,
        failure: classifyGraphFailure(res.status, body, appOnly),
        detail: `${base} responded ${res.status} ${body.slice(0, 400)}`,
      };
    }
    const data = await res.json();
    const id = (data.value?.[0]?.id as string | undefined) ?? null;
    return id ? { id } : { id: null, failure: 'meeting_not_found', detail: `${base} matched no meeting` };
  } catch (err) {
    return {
      id: null,
      failure: 'graph_error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolve a Graph *onlineMeeting* for a scheduled class, ready for artifact reads.
 *
 * The hard part: `nexus_scheduled_classes.teams_meeting_id` is NOT always an
 * onlineMeeting id. For a `channel_meeting` / imported group-calendar event it
 * holds the Outlook *event* id (`AAMk…`), and the meeting is organized by the
 * TEAM/group, not the teacher, so it never appears under the teacher's own
 * `/me/onlineMeetings`. Graph's `/me/onlineMeetings/{id}/…` artifact endpoints
 * then 400 with `InvalidArgument: Invalid meeting id`.
 *
 * Resolution order depends on the meeting kind, because trying the wrong path
 * first costs a Graph round trip that can never succeed:
 *   - Channel/group meeting (`@thread.tacv2` join URL, or an `AAMk…`/`AQMk…`
 *     stored id): app-only `/users/{organizerOid}/onlineMeetings` FIRST, since
 *     the delegated `/me` collection does not contain meetings organized by
 *     someone else. Needs the application permissions `OnlineMeetings.Read.All`
 *     and `OnlineMeetingArtifact.Read.All`, AND a Teams application access
 *     policy granting this app read access on behalf of that organizer.
 *   - Anything else: delegated `/me/onlineMeetings` first (the caller organized
 *     it), then app-only, then the stored id as-is.
 *
 * Failures are classified rather than swallowed, so a missing app permission is
 * distinguishable from a missing access policy and from a meeting that simply
 * never took place. Callers wanting that reason should use this function;
 * `resolveOnlineMeeting` is the null-returning wrapper.
 */
export async function resolveOnlineMeetingDetailed(opts: {
  delegatedToken?: string | null;
  teamsMeetingId: string | null;
  joinUrl: string | null;
  organizerOid?: string | null;
  /** Resolved by an earlier sync and cached on the class. Skips every lookup. */
  knownOnlineMeetingId?: string | null;
}): Promise<OnlineMeetingResolution> {
  const { delegatedToken, teamsMeetingId, joinUrl, organizerOid, knownOnlineMeetingId } = opts;

  // Already resolved once: go straight to the artifact path, no lookup at all.
  // On a 40-class cron batch this is the difference between 3 and 2 Graph calls
  // per class, which is what keeps us under the cloud-communications throttles.
  if (knownOnlineMeetingId && organizerOid) {
    try {
      return {
        meeting: {
          meetingId: knownOnlineMeetingId,
          artifactBase: `users/${organizerOid}/onlineMeetings/${knownOnlineMeetingId}`,
          token: await getAppOnlyToken(),
        },
      };
    } catch {
      // App-only creds unavailable; fall through to the normal ladder.
    }
  }

  // A channel/group meeting can never be resolved by the delegated /me
  // collection, so going app-only first saves a guaranteed-useless Graph round
  // trip on every single sync.
  const channelMeeting = isChannelMeeting(teamsMeetingId, joinUrl);

  /** A lookup attempt that also carries the base path and token it used. */
  type Attempt = (LookupResult & { base: string; token: string; appOnly: boolean }) | null;

  const tryDelegated = async (): Promise<Attempt> => {
    if (!joinUrl || !delegatedToken) return null;
    const base = 'me/onlineMeetings';
    const result = await lookupByJoinUrl(base, delegatedToken, joinUrl, false);
    return { ...result, base, token: delegatedToken, appOnly: false };
  };

  const tryAppOnly = async (): Promise<Attempt> => {
    if (!joinUrl || !organizerOid) return null;
    const base = `users/${organizerOid}/onlineMeetings`;
    let appToken: string;
    try {
      appToken = await getAppOnlyToken();
    } catch (err) {
      return {
        id: null,
        failure: 'graph_error',
        detail: `app-only token unavailable: ${err instanceof Error ? err.message : String(err)}`,
        base,
        token: '',
        appOnly: true,
      };
    }
    const result = await lookupByJoinUrl(base, appToken, joinUrl, true);
    return { ...result, base, token: appToken, appOnly: true };
  };

  const steps = channelMeeting ? [tryAppOnly, tryDelegated] : [tryDelegated, tryAppOnly];

  let bestFailure: MeetingLookupFailure | undefined;
  let bestDetail: string | undefined;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const run of steps) {
    const result = await run();
    if (!result) continue;
    if (result.id) {
      return {
        meeting: {
          meetingId: result.id,
          artifactBase: `${result.base}/${result.id}`,
          token: result.token,
        },
      };
    }
    if (!result.failure) continue;
    const rank = failureRank(result.failure, result.appOnly);
    if (rank < bestRank) {
      bestRank = rank;
      bestFailure = result.failure;
      bestDetail = result.detail;
    }
  }

  // Stored id is already an onlineMeeting id (link_only). Use it via delegated.
  if (teamsMeetingId && !channelMeeting && delegatedToken) {
    return {
      meeting: {
        meetingId: teamsMeetingId,
        artifactBase: `me/onlineMeetings/${teamsMeetingId}`,
        token: delegatedToken,
      },
    };
  }

  if (!organizerOid && !delegatedToken) {
    return { meeting: null, failure: 'no_organizer', detail: 'no organizer oid and no delegated token' };
  }

  return { meeting: null, failure: bestFailure ?? 'meeting_not_found', detail: bestDetail };
}

/**
 * Back-compatible wrapper: returns just the meeting, or null.
 * Prefer {@link resolveOnlineMeetingDetailed} when you need to tell the caller
 * WHY a lookup failed.
 */
export async function resolveOnlineMeeting(opts: {
  delegatedToken?: string | null;
  teamsMeetingId: string | null;
  joinUrl: string | null;
  organizerOid?: string | null;
}): Promise<ResolvedOnlineMeeting | null> {
  const { meeting } = await resolveOnlineMeetingDetailed(opts);
  return meeting;
}
