/**
 * Finding a class transcript, wherever it happens to be.
 *
 * There is no single place a Teams transcript lives. It might be pasted in by a
 * teacher, sitting behind a URL we cached earlier, reachable through the
 * SharePoint recording, or available from the Teams artifact API. So this is a
 * ladder: try each source in increasing order of cost, stop at the first that
 * produces something.
 *
 * Extracted because the same ladder was being written out again for each new
 * consumer (class summaries, recap generation, and now the catch-up class test).
 * Copies of a five-step fallback drift: one gets the live-Graph step, another
 * does not, and the difference shows up as "Generate works on that screen but
 * not this one".
 *
 * ORDER MATTERS, and it is not the obvious one. The Teams artifact route
 * (/onlineMeetings/{id}/transcripts) reads as the canonical source, but it is
 * governed by OnlineMeetingArtifact.Read.All plus a Teams application access
 * policy that this tenant has never granted (see lib/teams-access-policy), the
 * same grant that has blocked attendance since day one. The SharePoint route
 * needs only the driveItem permissions that already stream every recording in
 * production, so it goes first. When the Teams grant lands, the last rung starts
 * answering and nothing else has to change.
 *
 * Every step is best-effort. A transcript that cannot be found is a normal
 * outcome, not an error: the caller falls back to asking a human.
 */
import { parseVTT } from '@/lib/vtt-parser';
import { fetchTranscriptFromSharePoint } from '@/lib/sharepoint-transcript';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { resolveOnlineMeetingDetailed, resolveOrganizerOid } from '@/lib/teams-online-meeting';
import type { TranscriptEntry } from '@neram/database';

export interface TranscriptSourceClass {
  id: string;
  transcript_url?: string | null;
  recording_url?: string | null;
  /** The Outlook event id for a channel meeting. NOT an onlineMeeting id. */
  teams_meeting_id?: string | null;
  /** The real onlineMeeting id, resolved and cached by an earlier sync. */
  online_meeting_id?: string | null;
  teams_meeting_join_url?: string | null;
  teams_meeting_url?: string | null;
  organizer_ms_oid?: string | null;
  organizer_email?: string | null;
  teacher_id?: string | null;
}

export interface ResolveTranscriptInput {
  cls: TranscriptSourceClass;
  /**
   * The caller's delegated Microsoft token, when there is a signed-in human.
   * Optional: the automatic rungs run app-only, so this ladder works from a
   * cron or any other server context with no user attached.
   */
  msToken?: string | null;
  /** Raw text a teacher pasted in. */
  transcriptText?: unknown;
  /** A .vtt file a teacher uploaded. */
  vttContent?: unknown;
  /**
   * Supabase admin client. Optional: when given, a transcript found live on
   * Graph is written back to the class so the next call skips straight to it,
   * and the meeting organizer can be resolved for the artifact lookup.
   */
  supabase?: any;
}

export type TranscriptSource =
  | 'pasted'
  | 'vtt'
  | 'cached_url'
  | 'sharepoint'
  | 'graph_live'
  | 'none';

export interface ResolvedTranscript {
  entries: TranscriptEntry[];
  source: TranscriptSource;
  /**
   * The sentinel the SharePoint step threw, if it got that far and failed:
   * NO_ACCESS, VIDEO_NOT_FOUND or NO_TRANSCRIPT.
   *
   * Reported rather than thrown because for most callers a missing transcript is
   * just "ask a human", but the recap editor turns each of these into a
   * different, actionable message ("you do not have view access to this
   * recording" is worth saying; "no transcript found" is not the same thing).
   */
  sharepointError?: string;
  /**
   * Why the Teams artifact rung produced nothing: `app_permission_missing`,
   * `access_policy_missing`, `meeting_not_found` and friends. Worth surfacing in
   * logs, because those first two are tenant-admin work, not code work.
   */
  meetingFailure?: string;
}

/** Fetch a URL that needs a Graph bearer token, trying each token we hold. */
async function fetchWithAnyToken(url: string, tokens: Array<string | null | undefined>) {
  for (const token of tokens) {
    if (!token) continue;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) return await res.text();
    } catch {
      // Try the next token.
    }
  }
  return null;
}

export async function resolveTranscript(input: ResolveTranscriptInput): Promise<ResolvedTranscript> {
  const { cls, msToken, supabase } = input;

  // 1. What a human handed us wins: it is the only source that is certainly
  //    about this class and certainly complete.
  if (typeof input.transcriptText === 'string' && input.transcriptText.trim()) {
    return {
      entries: [{ start: 0, end: 0, text: input.transcriptText.trim() }],
      source: 'pasted',
    };
  }
  if (typeof input.vttContent === 'string' && input.vttContent.trim()) {
    const entries = parseVTT(input.vttContent);
    if (entries.length > 0) return { entries, source: 'vtt' };
  }

  // The app-only token is what makes every rung below work without a signed-in
  // user. Fetched once, lazily, because a class with a pasted transcript never
  // needs it.
  let appTokenCache: string | null | undefined;
  const appToken = async (): Promise<string | null> => {
    if (appTokenCache !== undefined) return appTokenCache;
    try {
      appTokenCache = await getAppOnlyToken();
    } catch (err) {
      console.error('[transcript] app-only token unavailable:', err);
      appTokenCache = null;
    }
    return appTokenCache;
  };

  // 2. A URL we resolved on an earlier run. Stored values are Graph content
  //    URLs, which need a token but not any particular person's token.
  if (cls.transcript_url) {
    const text = await fetchWithAnyToken(cls.transcript_url, [await appToken(), msToken]);
    if (text) {
      const entries = parseVTT(text);
      if (entries.length > 0) return { entries, source: 'cached_url' };
    }
    // Stale or expired. Keep going.
  }

  // 3. Through the recording itself, app-only. This is the rung that actually
  //    fires in production: the same driveItem permissions that stream the
  //    recording also read the transcript sitting beside it.
  //
  //    Throws sentinels (NO_ACCESS, VIDEO_NOT_FOUND, NO_TRANSCRIPT), which are
  //    reported rather than thrown.
  let sharepointError: string | undefined;
  if (cls.recording_url) {
    for (const token of [await appToken(), msToken]) {
      if (!token) continue;
      try {
        const entries = parseVTT(await fetchTranscriptFromSharePoint(cls.recording_url, token));
        if (entries.length > 0) return { entries, source: 'sharepoint' };
        sharepointError = 'NO_TRANSCRIPT';
      } catch (err) {
        sharepointError = err instanceof Error ? err.message : 'UNKNOWN';
      }
      // A delegated retry only makes sense when the app-only try was refused.
      if (sharepointError !== 'NO_ACCESS') break;
    }
  }

  // 4. The Teams artifact API. Blocked on this tenant today, kept because it is
  //    the only route for a class whose recording has not landed in SharePoint
  //    yet, and because it starts working the moment the access policy is
  //    granted.
  //
  //    Note what is NOT done here: hitting /me/onlineMeetings/{teams_meeting_id}.
  //    For a channel meeting that column holds an Outlook event id and Graph
  //    answers `InvalidArgument: Invalid meeting id`, which is why this rung
  //    silently produced nothing for every class it was ever asked about.
  let meetingFailure: string | undefined;
  const joinUrl = cls.teams_meeting_join_url || cls.teams_meeting_url || null;
  if (cls.online_meeting_id || joinUrl || cls.teams_meeting_id) {
    const organizerOid =
      cls.organizer_ms_oid ||
      (supabase
        ? await resolveOrganizerOid(supabase, {
            joinUrl,
            organizerEmail: cls.organizer_email ?? null,
            teacherId: cls.teacher_id ?? null,
          })
        : null);

    const resolution = await resolveOnlineMeetingDetailed({
      delegatedToken: msToken,
      teamsMeetingId: cls.teams_meeting_id ?? null,
      joinUrl,
      organizerOid,
      knownOnlineMeetingId: cls.online_meeting_id ?? null,
      // With a signed-in teacher, their own token is the one variant that needs
      // no Teams application access policy, so it is worth the extra round trip.
      preferDelegated: !!msToken,
    });
    meetingFailure = resolution.failure;

    if (resolution.meeting) {
      try {
        const listRes = await fetch(
          `https://graph.microsoft.com/v1.0/${resolution.meeting.artifactBase}/transcripts`,
          { headers: { Authorization: `Bearer ${resolution.meeting.token}` } },
        );
        if (listRes.ok) {
          const list = await listRes.json();
          const contentUrl = list.value?.[0]?.transcriptContentUrl || list.value?.[0]?.content || null;
          if (contentUrl) {
            const text = await fetchWithAnyToken(contentUrl, [resolution.meeting.token, msToken]);
            const entries = text ? parseVTT(text) : [];
            if (entries.length > 0) {
              // Remember it, so the next call comes in at rung 2.
              if (supabase) {
                try {
                  await supabase
                    .from('nexus_scheduled_classes')
                    .update({ transcript_url: contentUrl })
                    .eq('id', cls.id);
                } catch {
                  // A failed cache write is not a failed lookup.
                }
              }
              return { entries, source: 'graph_live' };
            }
          }
        } else {
          meetingFailure = `transcripts responded ${listRes.status}`;
        }
      } catch (err) {
        meetingFailure = err instanceof Error ? err.message : 'graph_error';
      }
    }
  }

  return { entries: [], source: 'none', sharepointError, meetingFailure };
}
