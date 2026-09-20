import { getSupabaseAdminClient } from '@neram/database';
import type { TranscriptEntry } from '@neram/database';
import { fetchTranscriptFromSharePoint } from '@/lib/sharepoint-transcript';
import { parseVTT } from '@/lib/vtt-parser';
import { classStartMs, parseRecordingFileName } from '@/lib/channel-recordings';

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

/** 'class' is the stored transcript of the Teams class the recording came from. */
export type TrackTranscriptSource = 'upload' | 'stored' | 'class' | 'sharepoint' | 'none';

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

/**
 * Forget the stored transcript of one recording. Called whenever its video changes.
 *
 * resolveTrackTranscript serves the stored copy before trying anything else, so a
 * transcript left behind after a video is replaced would be cut into checkpoints
 * for the NEW recording: the old video's words, at the old video's timings.
 * Clearing the checkpoints alone, which is all a video change used to do, left
 * exactly that trap.
 *
 * Throws rather than warns. A stale transcript produces wrong quizzes silently,
 * which is worse than a video change that visibly fails and can be retried.
 */
export async function forgetTrackTranscript(trackId: string): Promise<void> {
  const supabase = getSupabaseAdminClient() as any;
  const { error } = await supabase.from(TRANSCRIPTS).delete().eq('recap_id', trackId);
  // A PostgrestError is a plain object, not an Error, so it is wrapped rather
  // than thrown as it is.
  if (error) {
    throw new Error(
      `Could not clear the stored transcript: ${error.message || error.code || 'unknown error'}`,
    );
  }
}

/**
 * How far apart a Teams recording and its class can start. The recording begins
 * when someone presses record, which can be well into the class, and the same
 * window matchRecordingToClass settles on.
 */
export const CLASS_TRANSCRIPT_MATCH_WINDOW_MS = 90 * 60 * 1000;

/**
 * The transcript of the Teams class a recording came from, if one is stored.
 *
 * A class recorded in Teams already has its WEBVTT in nexus_class_transcripts,
 * put there by the nightly sync against the CLASS. A chapter recording made from
 * that class is the same video, so asking a teacher to download the transcript
 * from Stream and upload it by hand was asking for a copy Nexus already holds.
 *
 * Two ways to find the class, in order: a class whose recording_url is this
 * exact file, then the start time Teams writes into the file name, matched to a
 * class on the same IST day within the window. No Graph call either way.
 */
export async function findClassTranscriptVtt(
  supabase: any,
  input: { recordingUrl: string | null; recordingFileName: string | null },
): Promise<{ classId: string; vtt: string } | null> {
  const candidates: string[] = [];

  if (input.recordingUrl) {
    const { data } = await supabase
      .from('nexus_scheduled_classes')
      .select('id')
      .eq('recording_url', input.recordingUrl)
      .limit(3);
    for (const row of (data || []) as { id: string }[]) {
      if (row?.id) candidates.push(String(row.id));
    }
  }

  const parsed = input.recordingFileName ? parseRecordingFileName(input.recordingFileName) : null;
  if (parsed) {
    const date = parsed.startedAt.substring(0, 10);
    const startedMs = Date.parse(`${parsed.startedAt}+05:30`);
    const { data } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, scheduled_date, start_time')
      .eq('scheduled_date', date);
    const near = ((data || []) as { id: string; scheduled_date: string; start_time: string | null }[])
      .map((row) => ({
        id: String(row.id),
        delta: Math.abs(classStartMs(row.scheduled_date, String(row.start_time || '')) - startedMs),
      }))
      .filter((c) => Number.isFinite(c.delta) && c.delta <= CLASS_TRANSCRIPT_MATCH_WINDOW_MS)
      .sort((a, b) => a.delta - b.delta);
    for (const c of near) if (!candidates.includes(c.id)) candidates.push(c.id);
  }

  for (const classId of candidates) {
    const { data } = await supabase
      .from('nexus_class_transcripts')
      .select('vtt, status')
      .eq('class_id', classId)
      .maybeSingle();
    if (data?.status === 'ok' && typeof data.vtt === 'string' && data.vtt.trim()) {
      return { classId, vtt: data.vtt };
    }
  }
  return null;
}

/** Track languages whose Microsoft transcripts are not worth reading. */
const MICROSOFT_CANNOT_TRANSCRIBE = new Set(['ta', 'ta_en']);

export async function resolveTrackTranscript(input: {
  trackId: string;
  recordingUrl: string | null;
  /** The video's file name. A Teams recording's name carries its class start time. */
  recordingFileName?: string | null;
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
  /**
   * The track's language. A Tamil track skips rungs 3 and 4: Microsoft Stream
   * cannot transcribe Tamil (it is not on Stream's language list, checked
   * 2026-09-17) and a Teams class taught in Tamil comes back the same way, as
   * English-sounding words the tutor never said. Checkpoints cut from that are
   * wrong, so a Tamil track waits for an English transcript from AI Studio or a
   * teacher instead.
   */
  language?: string | null;
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

  if (input.language && MICROSOFT_CANNOT_TRANSCRIBE.has(input.language)) {
    return { entries: [], source: 'none', sharepointError: 'NO_TRANSCRIPT' };
  }

  // 3. The Teams class this recording came from, when the nightly sync already
  //    stored that class's transcript. No Graph call and no token needed.
  if (input.videoSource !== 'youtube') {
    const fromClass = await findClassTranscriptVtt(getSupabaseAdminClient(), {
      recordingUrl: input.recordingUrl,
      recordingFileName: input.recordingFileName ?? null,
    }).catch(() => null);
    if (fromClass) {
      const entries = parseVTT(fromClass.vtt);
      if (entries.length) {
        await store(input.trackId, fromClass.vtt, entries, 'class');
        return { entries, source: 'class' };
      }
    }
  }

  // 4. Graph, via the recording's sharing link. Only meaningful for a file that
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
