/**
 * Switching a class onto its trimmed recording, or back to the original.
 *
 * Everything stored about a recording is a time on some timeline: checkpoint
 * start and end, transcript cues, YouTube chapters, each student's resume point
 * and the stretches they played. Applying a trim moves all of it onto the
 * trimmed copy's timeline; "Use original" moves it back. This file works out
 * every moved value (buildTrimSwitch, pure and unit tested) and hands the lot
 * to nexus_apply_recording_trim, which writes it in one transaction.
 *
 * A student watching while this runs is protected twice. Each progress row is
 * written only if its watch_version has not moved since it was read, or the
 * whole switch rolls back and is retried with fresh numbers. And the recap's
 * timeline_version goes up, so a player still open on the old timeline is told
 * to reload rather than saving positions that now mean something else.
 */

import { evictMedia } from './recording-source-cache';
import {
  moveChapters,
  moveSections,
  rangesToOriginal,
  rangesToTrimmed,
  remapVtt,
  toOriginal,
  toTrimmed,
  type Chapter,
  type CutMapSegment,
} from './trim-map';
import { readStoredWatch, storedRanges } from './watch-ledger';

export type SwitchMode = 'apply' | 'revert';

export interface TrimRecord {
  id: string;
  class_id: string;
  original_url: string;
  original_drive_id: string | null;
  original_item_id: string | null;
  original_duration_seconds: number | null;
  trimmed_url: string | null;
  trimmed_drive_id: string | null;
  trimmed_item_id: string | null;
  trimmed_duration_seconds: number | null;
  removed_seconds: number | null;
  cut_map: CutMapSegment[] | null;
}

export interface ProgressRow {
  student_id: string;
  watch_version: number;
  last_video_position_seconds: number | null;
  furthest_position_seconds: number | null;
  watched_seconds: number | null;
  played_ranges: unknown;
}

export interface RecapForSwitch {
  id: string;
  sections: Array<{ id: string; start_timestamp_seconds: number; end_timestamp_seconds: number }>;
  progress: ProgressRow[];
}

export interface SwitchInputs {
  mode: SwitchMode;
  trim: TrimRecord;
  /** The transcript on the ORIGINAL timeline (vtt_original when trimmed, else vtt). */
  vttOriginal: string | null;
  recaps: RecapForSwitch[];
  /** Chapters as currently stored, on the timeline being switched away from. */
  chapters: Chapter[] | null;
}

export function buildTrimSwitch(input: SwitchInputs) {
  const { mode, trim } = input;
  const map = trim.cut_map ?? [];
  if (!map.length) throw new Error('TRIM_HAS_NO_CUT_MAP');
  const move = mode === 'apply' ? (t: number) => toTrimmed(map, t) : (t: number) => toOriginal(map, t);
  const moveRanges = mode === 'apply' ? rangesToTrimmed : rangesToOriginal;

  const apply = mode === 'apply';
  const duration = Number(apply ? trim.trimmed_duration_seconds : trim.original_duration_seconds) || 0;

  return {
    mode,
    class: {
      // Kept on revert too, so "Use trimmed" can switch straight back.
      trimmed_url: trim.trimmed_url,
      state: apply ? 'applied' : 'reverted',
      removed_seconds: Math.round(Number(trim.removed_seconds) || 0),
      duration_minutes: duration > 0 ? Math.round(duration / 60) : null,
    },
    // Applying serves the remapped copy; reverting restores the original text.
    vtt: input.vttOriginal ? (apply ? remapVtt(input.vttOriginal, map) : input.vttOriginal) : null,
    recaps: input.recaps.map((recap) => ({
      id: recap.id,
      recording_url: apply ? trim.trimmed_url : trim.original_url,
      drive_id: apply ? trim.trimmed_drive_id : trim.original_drive_id,
      item_id: apply ? trim.trimmed_item_id : trim.original_item_id,
      duration_seconds: Math.round(duration),
      sections: moveSections(recap.sections, move).map((s) => ({
        id: s.id,
        start: Math.round(s.start_timestamp_seconds),
        end: Math.round(s.end_timestamp_seconds),
      })),
      progress: recap.progress.map((row) => {
        // A row from before the watch ledger stands for a prefix; storedRanges
        // turns it into one, so it moves like any other.
        const ranges = storedRanges(readStoredWatch(row));
        return {
          student_id: row.student_id,
          version: Number(row.watch_version) || 0,
          pos: Math.round(move(Number(row.last_video_position_seconds) || 0)),
          furthest: Math.round(move(Number(row.furthest_position_seconds) || 0)),
          ranges: moveRanges(map, ranges),
        };
      }),
    })),
    chapters: input.chapters ? moveChapters(input.chapters, move) : null,
  };
}

// `any`: the nexus_* tables are absent from database.generated.ts, the same
// convention the recap routes use.
async function readSwitchInputs(supabase: any, trim: TrimRecord, mode: SwitchMode): Promise<SwitchInputs> {
  const [{ data: transcript }, { data: recaps }, { data: meta }] = await Promise.all([
    supabase.from('nexus_class_transcripts').select('vtt, vtt_original, status').eq('class_id', trim.class_id).maybeSingle(),
    supabase.from('nexus_class_recaps').select('id').eq('scheduled_class_id', trim.class_id),
    supabase.from('nexus_class_video_meta').select('chapters').eq('scheduled_class_id', trim.class_id).maybeSingle(),
  ]);
  const recapIds: string[] = (recaps ?? []).map((r: { id: string }) => r.id);

  const [{ data: sections }, { data: progress }] = recapIds.length
    ? await Promise.all([
        supabase
          .from('nexus_class_recap_sections')
          .select('id, recap_id, start_timestamp_seconds, end_timestamp_seconds')
          .in('recap_id', recapIds),
        supabase
          .from('nexus_class_recap_progress')
          .select(
            'recap_id, student_id, watch_version, last_video_position_seconds, furthest_position_seconds, watched_seconds, played_ranges',
          )
          .in('recap_id', recapIds),
      ])
    : [{ data: [] }, { data: [] }];

  return {
    mode,
    trim,
    vttOriginal: transcript ? (transcript.vtt_original ?? transcript.vtt ?? null) : null,
    recaps: recapIds.map((id) => ({
      id,
      sections: (sections ?? []).filter((s: any) => s.recap_id === id),
      progress: (progress ?? []).filter((p: any) => p.recap_id === id),
    })),
    chapters: Array.isArray(meta?.chapters) ? meta.chapters : null,
  };
}

/**
 * Switch a class onto its trimmed copy ('apply') or back ('revert'). Retries a
 * few times when a student's heartbeat lands mid-switch.
 */
export async function switchRecordingTrim(
  supabase: any,
  trim: TrimRecord,
  mode: SwitchMode,
  actorId: string | null,
): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const payload = buildTrimSwitch(await readSwitchInputs(supabase, trim, mode));
    const { error } = await supabase.rpc('nexus_apply_recording_trim', {
      p_trim: trim.id,
      p_payload: payload,
      p_actor: actorId,
    });
    if (!error) {
      evictMedia('class', trim.class_id);
      for (const recap of payload.recaps) evictMedia('recap', recap.id);
      if (mode === 'apply') await queueYouTubeReupload(supabase, trim.class_id);
      return;
    }
    lastError = error;
    if (!/PROGRESS_CONFLICT/.test(error.message ?? '')) break;
  }
  throw lastError instanceof Error ? lastError : new Error((lastError as any)?.message ?? 'TRIM_SWITCH_FAILED');
}

/**
 * A class already backed up to YouTube untrimmed gets the trimmed copy uploaded
 * in its place (founder, 2026-10-14). The backup sync picks up 'reupload' rows;
 * the old video id is kept so staff can make it private once the new one is
 * published.
 */
async function queueYouTubeReupload(supabase: any, classId: string): Promise<void> {
  const { data: upload } = await supabase
    .from('nexus_class_video_uploads')
    .select('status, source_variant, youtube_video_id')
    .eq('class_id', classId)
    .maybeSingle();
  if (!upload || upload.status !== 'ok' || upload.source_variant === 'trimmed' || !upload.youtube_video_id) return;
  await supabase
    .from('nexus_class_video_uploads')
    .update({
      status: 'reupload',
      replaced_video_id: upload.youtube_video_id,
      upload_session_uri: null,
      bytes_uploaded: 0,
      detail: null,
    })
    .eq('class_id', classId);
}
