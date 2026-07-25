import { getAppOnlyToken } from '@/lib/graph-app-token';

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

async function lookupByJoinUrl(base: string, token: string, joinUrl: string): Promise<string | null> {
  const filter = `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/${base}?$filter=${encodeURIComponent(filter)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.value?.[0]?.id as string | undefined) ?? null;
  } catch {
    return null;
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
 * Resolution order:
 *   1. Delegated `/me/onlineMeetings` by join URL, works when the caller IS the
 *      organizer (Nexus link_only / calendar meetings the teacher created).
 *   2. App-only `/users/{organizerOid}/onlineMeetings` by join URL, the path for
 *      channel/group meetings. Needs the app permission `OnlineMeetingArtifact.Read.All`
 *      AND a Teams application access policy granting the app read access on behalf
 *      of that organizer. Best-effort: returns null (not a throw) if unavailable.
 *   3. Fall back to the stored id when it already looks like an onlineMeeting id
 *      (i.e. not an `AAMk…` Outlook item id).
 */
export async function resolveOnlineMeeting(opts: {
  delegatedToken: string;
  teamsMeetingId: string | null;
  joinUrl: string | null;
  organizerOid?: string | null;
}): Promise<ResolvedOnlineMeeting | null> {
  const { delegatedToken, teamsMeetingId, joinUrl, organizerOid } = opts;

  // 1. Caller is the organizer (delegated).
  if (joinUrl) {
    const id = await lookupByJoinUrl('me/onlineMeetings', delegatedToken, joinUrl);
    if (id) return { meetingId: id, artifactBase: `me/onlineMeetings/${id}`, token: delegatedToken };
  }

  // 2. Group/channel meeting: read on behalf of the organizer with an app token.
  if (joinUrl && organizerOid) {
    try {
      const appToken = await getAppOnlyToken();
      const base = `users/${organizerOid}/onlineMeetings`;
      const id = await lookupByJoinUrl(base, appToken, joinUrl);
      if (id) return { meetingId: id, artifactBase: `${base}/${id}`, token: appToken };
    } catch {
      // app-only unavailable (missing creds/permission/policy) — fall through
    }
  }

  // 3. Stored id is already an onlineMeeting id (link_only). Use it via delegated.
  if (teamsMeetingId && !teamsMeetingId.startsWith('AAMk')) {
    return {
      meetingId: teamsMeetingId,
      artifactBase: `me/onlineMeetings/${teamsMeetingId}`,
      token: delegatedToken,
    };
  }

  return null;
}
