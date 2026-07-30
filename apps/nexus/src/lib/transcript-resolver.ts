/**
 * Finding a class transcript, wherever it happens to be, then never looking again.
 *
 * There is no single place a Teams transcript lives. It might be handed over by a
 * teacher, already stored here from an earlier run, sitting behind a URL we
 * cached, available from the Teams artifact API, or beside the recording in
 * SharePoint. So this is a ladder: try each source in increasing order of cost,
 * stop at the first that produces something, and WRITE THE RESULT DOWN so the
 * next caller stops at rung 3 for free.
 *
 * Extracted because the same ladder was being written out again for each new
 * consumer (class summaries, recap generation, the YouTube prompt builder, the
 * catch-up class test). Copies of a five-step fallback drift: one gets the live
 * Graph step, another does not, and the difference shows up as "Generate works on
 * that screen but not this one".
 *
 * ORDER, and the two bugs that used to make all of this moot (both verified
 * against production Graph on 2026-07-30, do not reintroduce either):
 *
 *  1. `Accept: *\/*`, which is what Node's fetch sends when you do not say
 *     otherwise, makes Graph answer `400 BadRequest: Invalid format '*\/*'` on
 *     every transcript /content URL. So the cached-URL rung and the artifact rung
 *     both failed for every class ever asked about, silently, because a failed
 *     fetch is a normal fall-through here. See withVttFormat below: ask for
 *     text/vtt in the header AND the query string.
 *  2. The SharePoint `media/transcripts` beta endpoint answers
 *     `400 invalidRequest: Unsupported segment type` in every URL shape. It is
 *     gone. What is left of the SharePoint rung is a scan for a sibling .vtt,
 *     which is why it now sits LAST rather than first.
 *
 * The Teams artifact rung is no longer the blocked one. The tenant-wide Teams
 * application access policy that held up attendance for months has landed, proven
 * by attendance rows with source='teams', and the artifact LIST answers 200. So
 * it moved above SharePoint, which is the rung that can no longer answer at all.
 *
 * Every automatic step is best-effort. A transcript that cannot be found is a
 * normal outcome, not an error: the caller falls back to asking a human.
 */
import { parseVTT } from '@/lib/vtt-parser';
import { fetchTranscriptFromSharePoint } from '@/lib/sharepoint-transcript';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { resolveOnlineMeetingDetailed, resolveOrganizerOid } from '@/lib/teams-online-meeting';
import type { TranscriptEntry } from '@neram/database';

/**
 * Failed attempts before a class is declared hopeless. Only the cron counts
 * against this; a teacher pressing Generate must never be able to exhaust it,
 * or six impatient presses would stop the cron from ever trying again.
 */
export const MAX_TRANSCRIPT_ATTEMPTS = 6;

/**
 * How far a transcript's createdDateTime may sit from the class start before we
 * refuse to believe it belongs to this class. Only consulted when a meeting id
 * offers more than one transcript, which is what a recurring meeting does: it
 * reuses a single onlineMeeting id across every occurrence.
 */
const CLASS_MATCH_TOLERANCE_MS = 4 * 60 * 60 * 1000;

/**
 * How many of a meeting's transcripts we will try to download before giving up.
 * Teams offers two per class (see rankTranscriptsForClass), so this only needs to
 * be greater than one; it exists to keep a strange meeting from costing an
 * unbounded number of Graph calls.
 */
const MAX_TRANSCRIPT_CANDIDATES = 3;

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
  /** Used to pick the right occurrence when one meeting id holds several transcripts. */
  scheduled_date?: string | null;
  start_time?: string | null;
}

export interface ResolveTranscriptInput {
  cls: TranscriptSourceClass;
  /**
   * The caller's delegated Microsoft token, when there is a signed-in human.
   * Optional: the automatic rungs run app-only, so this ladder works from a
   * cron or any other server context with no user attached.
   */
  msToken?: string | null;
  /** Raw text a teacher pasted or uploaded as .txt. */
  transcriptText?: unknown;
  /** A .vtt file a teacher uploaded. */
  vttContent?: unknown;
  /**
   * Supabase admin client. Optional, but without it this ladder cannot read or
   * write the stored copy, so every call pays full Graph price. Pass it.
   */
  supabase?: any;
}

export type TranscriptSource =
  | 'pasted'
  | 'vtt'
  | 'stored'
  | 'cached_url'
  | 'graph_live'
  | 'sharepoint'
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

/**
 * Graph rejects a transcript content request that does not name a format, and
 * Node's fetch defaults to `Accept: *\/*`, which counts as not naming one. Both
 * the query param and the header work on their own; sending both costs nothing
 * and survives either being ignored.
 */
function withVttFormat(url: string): string {
  if (/[?&]\$format=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}$format=text/vtt`;
}

/** Fetch transcript content that needs a Graph bearer token, trying each token we hold. */
async function fetchTranscriptContent(url: string, tokens: Array<string | null | undefined>) {
  const target = withVttFormat(url);
  for (const token of tokens) {
    if (!token) continue;
    try {
      const res = await fetch(target, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/vtt' },
      });
      if (res.ok) return await res.text();
      console.warn(`[transcript] content fetch answered ${res.status} for class transcript`);
    } catch (err) {
      console.warn('[transcript] content fetch threw:', err);
    }
  }
  return null;
}

/**
 * Turn stored text back into entries.
 *
 * Tries VTT first and falls back to one untimed entry, which is what a pasted
 * transcript is. Sniffing the text rather than trusting the stored `source`
 * means a row written by an older version still reads correctly.
 */
function entriesFromText(text: string): TranscriptEntry[] {
  const parsed = parseVTT(text);
  if (parsed.length > 0) return parsed;
  const trimmed = text.trim();
  return trimmed ? [{ start: 0, end: 0, text: trimmed }] : [];
}

/** The class start as epoch ms, or null when the row did not carry the date. */
function classStartMs(cls: TranscriptSourceClass): number | null {
  if (!cls.scheduled_date || !cls.start_time) return null;
  const ms = new Date(`${cls.scheduled_date}T${cls.start_time.substring(0, 5)}:00+05:30`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** The bits of a Graph callTranscript this ladder reads. */
interface GraphTranscript {
  id?: string;
  createdDateTime?: string;
  transcriptContentUrl?: string;
  content?: string;
}

/**
 * Which of a meeting's transcripts could belong to this class, best guess first.
 *
 * Returns a RANKED LIST rather than one winner, and that is the whole point.
 * Teams offers two entries per meeting: the real transcript, and a phantom
 * created two or three seconds earlier whose /content answers
 * `404 No transcript content found`. Being created earlier makes the phantom
 * nearer the class start, so it always won, and a picker that commits to one
 * candidate then threw away a complete transcript sitting in the next entry.
 * Verified on production for the 20 and 22 July classes on 2026-07-30.
 *
 * A recurring meeting reuses one onlineMeeting id across every occurrence, so
 * the list can also hold genuinely unrelated nights. Those are still excluded by
 * the tolerance, which is why this ranks and filters rather than just returning
 * everything: the caller must not be handed last week's class as a fallback.
 */
function rankTranscriptsForClass(
  items: GraphTranscript[],
  startMs: number | null,
): GraphTranscript[] {
  if (items.length <= 1) return items.slice();
  // No class start to compare against, so recency is the only signal we have.
  // Reversed because Graph lists these oldest first.
  if (!startMs) return items.slice().reverse();

  const scored: Array<{ item: GraphTranscript; delta: number }> = [];
  for (const item of items) {
    const created = item.createdDateTime ? new Date(item.createdDateTime).getTime() : NaN;
    if (!Number.isFinite(created)) continue;
    const delta = Math.abs(created - startMs);
    if (delta <= CLASS_MATCH_TOLERANCE_MS) scored.push({ item, delta });
  }
  scored.sort((a, b) => a.delta - b.delta);
  return scored.map((s) => s.item);
}

/**
 * Read the stored copy. Free: one primary-key lookup, no token, no network.
 *
 * Exported because the YouTube metadata generator wants the transcript WITHOUT
 * running the ladder. Every other rung costs a Graph call and, worse, counts
 * against this class's transcript attempt cap, so a metadata run on a class the
 * transcript sweep has already given up on would burn attempts on a hunt that
 * has provably failed six times. Nothing but the ladder itself should call
 * resolveTranscript.
 */
export async function readStoredTranscript(
  supabase: any,
  classId: string,
): Promise<TranscriptEntry[] | null> {
  try {
    const { data, error } = await supabase
      .from('nexus_class_transcripts')
      .select('vtt, status')
      .eq('class_id', classId)
      .maybeSingle();
    // Worth a line: the usual cause is the table not existing yet, and the only
    // other symptom is every call silently paying full Graph price.
    if (error) console.warn(`[transcript] stored read refused for ${classId}:`, error.message);
    if (!data?.vtt) return null;
    const entries = entriesFromText(data.vtt);
    return entries.length > 0 ? entries : null;
  } catch (err) {
    // A missing table or a read failure must not break generation.
    console.warn('[transcript] stored read failed:', err);
    return null;
  }
}

/**
 * Store a transcript so nothing fetches it again.
 *
 * Resets attempts and detail, because a stored transcript settles the class: the
 * cron's candidate scan skips `status='ok'` rows outright.
 *
 * The error is checked rather than discarded. PostgREST does not throw, it hands
 * back `{ error }`, so an unchecked write here would fail on every class forever
 * and present as nothing worse than "the transcript fetch is slow", which is how
 * a whole table of payments once went unwritten.
 */
export async function saveTranscript(
  supabase: any,
  classId: string,
  payload: { vtt: string; segments: number; source: TranscriptSource },
): Promise<void> {
  if (!supabase || !classId || !payload.vtt.trim()) return;
  try {
    const { error } = await supabase.from('nexus_class_transcripts').upsert(
      {
        class_id: classId,
        vtt: payload.vtt,
        segments: payload.segments,
        source: payload.source,
        status: 'ok',
        detail: null,
        attempts: 0,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'class_id' },
    );
    if (error) {
      console.error(`[transcript] STORE FAILED for class ${classId}:`, error.message);
    }
  } catch (err) {
    // A failed store is not a failed lookup. The caller still has the transcript.
    console.error(`[transcript] could not store transcript for class ${classId}:`, err);
  }
}

/**
 * Note that a hunt came up empty, and count it.
 *
 * Only the cron should call this. Counting an interactive press would let a
 * teacher who presses Generate six times while Teams is still processing push
 * the class to `unavailable`, after which nothing would ever try again.
 */
export async function recordTranscriptFailure(
  supabase: any,
  classId: string,
  detail: string,
): Promise<'pending' | 'unavailable'> {
  const { data: existing } = await supabase
    .from('nexus_class_transcripts')
    .select('attempts')
    .eq('class_id', classId)
    .maybeSingle();

  const attempts = (existing?.attempts ?? 0) + 1;
  const status = attempts >= MAX_TRANSCRIPT_ATTEMPTS ? 'unavailable' : 'pending';

  // Checked, because an unwritten attempt count means the cap never bites and
  // every hopeless class is retried twice a night for good.
  const { error } = await supabase.from('nexus_class_transcripts').upsert(
    {
      class_id: classId,
      status,
      detail: detail.substring(0, 500),
      attempts,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'class_id' },
  );
  if (error) {
    console.error(`[transcript] could not record attempt ${attempts} for ${classId}:`, error.message);
  }

  return status;
}

export async function resolveTranscript(input: ResolveTranscriptInput): Promise<ResolvedTranscript> {
  const { cls, msToken, supabase } = input;

  /** Every successful rung funnels through here, so nothing can forget to store. */
  const found = async (text: string, source: TranscriptSource): Promise<ResolvedTranscript> => {
    const entries = entriesFromText(text);
    await saveTranscript(supabase, cls.id, { vtt: text, segments: entries.length, source });
    return { entries, source };
  };

  // 1. What a human handed us wins, ahead of even the stored copy: an upload is
  //    how a teacher corrects a transcript we got wrong, so it has to overwrite.
  if (typeof input.transcriptText === 'string' && input.transcriptText.trim()) {
    return await found(input.transcriptText.trim(), 'pasted');
  }
  if (typeof input.vttContent === 'string' && input.vttContent.trim()) {
    const entries = parseVTT(input.vttContent);
    if (entries.length > 0) {
      await saveTranscript(supabase, cls.id, {
        vtt: input.vttContent,
        segments: entries.length,
        source: 'vtt',
      });
      return { entries, source: 'vtt' };
    }
  }

  // 2. The stored copy. This is the rung that makes the second press, and every
  //    press after it, cost nothing at all.
  if (supabase) {
    const stored = await readStoredTranscript(supabase, cls.id);
    if (stored) return { entries: stored, source: 'stored' };
  }

  // The app-only token is what makes every rung below work without a signed-in
  // user. Fetched once, lazily, because a class with a stored transcript never
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

  // 3. A URL we resolved on an earlier run. Stored values are Graph content
  //    URLs, which need a token but not any particular person's token.
  if (cls.transcript_url) {
    const text = await fetchTranscriptContent(cls.transcript_url, [await appToken(), msToken]);
    if (text && parseVTT(text).length > 0) return await found(text, 'cached_url');
    // Stale, expired, or refused. Keep going.
  }

  // 4. The Teams artifact API, which is now the rung that actually answers.
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
          const candidates = rankTranscriptsForClass(list.value || [], classStartMs(cls));
          if (candidates.length === 0) {
            meetingFailure = (list.value || []).length
              ? 'no_transcript_matches_this_class'
              : 'NO_TRANSCRIPT';
          } else {
            // Work down the ranking until one actually yields readable content.
            // Bounded so a meeting listing many entries cannot turn one class
            // into an unbounded run of Graph calls.
            for (const pick of candidates.slice(0, MAX_TRANSCRIPT_CANDIDATES)) {
              const contentUrl = pick.transcriptContentUrl || pick.content || null;
              if (!contentUrl) continue;
              const text = await fetchTranscriptContent(contentUrl, [
                resolution.meeting.token,
                msToken,
              ]);
              if (text && parseVTT(text).length > 0) {
                // Remember the pointer too. Cheap, and other code reads it.
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
                return await found(text, 'graph_live');
              }
              meetingFailure = 'transcript_content_unreadable';
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

  // 5. Beside the recording in SharePoint, app-only. All that survives here is a
  //    scan for a sibling .vtt: the media/transcripts endpoint this rung was
  //    built on no longer exists. Kept because it costs one call and is the only
  //    route for a transcript that was exported to the recording folder by hand.
  //
  //    Throws sentinels (NO_ACCESS, VIDEO_NOT_FOUND, NO_TRANSCRIPT), which are
  //    reported rather than thrown.
  let sharepointError: string | undefined;
  if (cls.recording_url) {
    for (const token of [await appToken(), msToken]) {
      if (!token) continue;
      try {
        const text = await fetchTranscriptFromSharePoint(cls.recording_url, token);
        if (parseVTT(text).length > 0) return await found(text, 'sharepoint');
        sharepointError = 'NO_TRANSCRIPT';
      } catch (err) {
        sharepointError = err instanceof Error ? err.message : 'UNKNOWN';
      }
      // A delegated retry only makes sense when the app-only try was refused.
      if (sharepointError !== 'NO_ACCESS') break;
    }
  }

  return { entries: [], source: 'none', sharepointError, meetingFailure };
}
