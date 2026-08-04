import { getSupabaseAdminClient } from '@neram/database';
import type { TranscriptEntry } from '@neram/database';
import { fetchTranscriptFromSharePoint } from '@/lib/sharepoint-transcript';
import { parseVTT } from '@/lib/vtt-parser';

/**
 * Where a Foundation chapter track's transcript comes from.
 *
 * A three-rung ladder rather than the six-rung one in transcript-resolver.ts,
 * because a track has no Teams meeting behind it. There is no online meeting to
 * ask Graph about, no cached meeting URL and no scheduled class row, so four of
 * those rungs describe things that do not exist here.
 *
 * It is a separate module for a load-bearing reason, not for tidiness.
 * resolveTranscript writes nexus_scheduled_classes.transcript_url and calls
 * saveTranscript(supabase, cls.id, …), both keyed on a scheduled class. Handing
 * it a track id would target a class row that does not exist: the write silently
 * matches nothing, and the transcript is re-fetched from Graph on every press
 * forever. Hence nexus_class_recap_transcripts, keyed on the recap.
 *
 *   1. A .vtt the teacher just uploaded. Always wins: they are looking at it.
 *   2. What we stored last time, so pressing Generate twice is not two Graph
 *      round trips against a 90 minute recording.
 *   3. Microsoft Graph, via the recording's SharePoint sharing link.
 */

const TRANSCRIPTS = 'nexus_class_recap_transcripts';

export type TrackTranscriptSource = 'upload' | 'stored' | 'sharepoint' | 'none';

/** No transcript, and why. Each maps to a different sentence for the teacher. */
export type TrackTranscriptError =
  | 'NO_ACCESS'
  | 'VIDEO_NOT_FOUND'
  | 'NO_TRANSCRIPT'
  /** A YouTube-hosted track: there is no SharePoint folder to search at all. */
  | 'YOUTUBE_NO_FETCH';

export interface TrackTranscript {
  entries: TranscriptEntry[];
  source: TrackTranscriptSource;
  /**
   * The sentinel the SharePoint step threw, if it got that far and failed:
   * NO_ACCESS, VIDEO_NOT_FOUND or NO_TRANSCRIPT. Reported rather than thrown,
   * because the editor turns each into a different, actionable sentence. "You do
   * not have view access to this recording" is worth saying; "no transcript
   * found" is a different problem with a different fix.
   */
  sharepointError?: string;
}

async function readStored(trackId: string): Promise<TranscriptEntry[] | null> {
  const supabase = getSupabaseAdminClient() as any;
  const { data } = await supabase
    .from(TRANSCRIPTS)
    .select('vtt, status')
    .eq('recap_id', trackId)
    .maybeSingle();
  if (!data?.vtt || data.status !== 'ok') return null;
  const entries = parseVTT(data.vtt);
  return entries.length ? entries : null;
}

async function store(
  trackId: string,
  vtt: string,
  entries: TranscriptEntry[],
  source: TrackTranscriptSource,
): Promise<void> {
  const supabase = getSupabaseAdminClient() as any;
  await supabase
    .from(TRANSCRIPTS)
    .upsert(
      {
        recap_id: trackId,
        vtt,
        segments: entries.length,
        source,
        status: 'ok',
        detail: null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'recap_id' },
    )
    // Best-effort. A transcript we could not cache is a slower Generate next
    // time, not a failed one, and it must not cost the teacher this press.
    .then(undefined, () => undefined);
}

async function recordFailure(trackId: string, detail: string): Promise<void> {
  const supabase = getSupabaseAdminClient() as any;
  const { data } = await supabase
    .from(TRANSCRIPTS)
    .select('attempts')
    .eq('recap_id', trackId)
    .maybeSingle();
  await supabase
    .from(TRANSCRIPTS)
    .upsert(
      {
        recap_id: trackId,
        status: detail === 'NO_TRANSCRIPT' ? 'missing' : 'failed',
        detail,
        attempts: (data?.attempts ?? 0) + 1,
      },
      { onConflict: 'recap_id' },
    )
    .then(undefined, () => undefined);
}

export async function resolveTrackTranscript(input: {
  trackId: string;
  recordingUrl: string | null;
  /** A .vtt the teacher pasted or uploaded in this request. */
  vttContent?: string | null;
  /** The teacher's Microsoft token. Without it, rung 3 is skipped. */
  msToken?: string | null;
  /**
   * 'youtube' skips rung 3 outright. Graph can only resolve a SharePoint sharing
   * URL, so handing it a youtu.be link produces VIDEO_NOT_FOUND, which reads to
   * the teacher as "that recording link is broken" when the link is fine and the
   * step simply does not apply.
   */
  videoSource?: string | null;
}): Promise<TrackTranscript> {
  // 1. The upload in front of them.
  if (input.vttContent) {
    const entries = parseVTT(input.vttContent);
    if (entries.length) {
      await store(input.trackId, input.vttContent, entries, 'upload');
      return { entries, source: 'upload' };
    }
  }

  // 2. What we already have.
  const stored = await readStored(input.trackId);
  if (stored) return { entries: stored, source: 'stored' };

  // 3. Graph, via the recording's sharing link. Only meaningful for a file that
  //    actually lives in SharePoint.
  if (input.videoSource === 'youtube') {
    return { entries: [], source: 'none', sharepointError: 'YOUTUBE_NO_FETCH' };
  }
  if (!input.recordingUrl || !input.msToken) {
    return { entries: [], source: 'none', sharepointError: 'NO_TRANSCRIPT' };
  }
  try {
    const vtt = await fetchTranscriptFromSharePoint(input.recordingUrl, input.msToken);
    const entries = parseVTT(vtt);
    if (!entries.length) {
      await recordFailure(input.trackId, 'NO_TRANSCRIPT');
      return { entries: [], source: 'none', sharepointError: 'NO_TRANSCRIPT' };
    }
    await store(input.trackId, vtt, entries, 'sharepoint');
    return { entries, source: 'sharepoint' };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'NO_TRANSCRIPT';
    await recordFailure(input.trackId, code);
    return { entries: [], source: 'none', sharepointError: code };
  }
}
