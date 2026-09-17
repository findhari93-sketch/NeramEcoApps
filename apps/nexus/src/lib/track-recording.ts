/**
 * One language's recording on a chapter, as the teacher's recordings page needs it.
 *
 * Server side only. The page shows the video by its real name, folder and length,
 * says whether it may be used, and offers exactly one next step
 * (lib/recording-flow.ts). This module answers the first two from SharePoint and
 * decides whether "create checkpoints" should actually run.
 */

import type { RecordingProblem, ResolvedRecording } from './recording-flow';
import { describeRecordingUrl } from './chapter-recordings';
import {
  findRecordingItem,
  recordingPolicyProblem,
  resolveVideoItemCached,
  VideoItemError,
  type ResolvedVideoItem,
  type VideoItemRef,
} from './sharepoint-video';
import { resolveSectionGate, type SectionGateColumns } from './recap-gate';
import { readRecapDefaults } from './recap-defaults';

/* ── What the video is ──────────────────────────────────────────────────────── */

export interface TrackRecordingRow {
  video_source: string | null;
  recording_url: string | null;
  recording_file_name: string | null;
  video_duration_seconds: number | null;
  /** Absent on a row read before the id columns existed. */
  recording_drive_id?: string | null;
  recording_item_id?: string | null;
}

export interface TrackRecordingDescription {
  recording: ResolvedRecording | null;
  /**
   * Columns the row was missing, or holds wrongly, that the lookup can fill: a
   * name, a length, the file's ids, or its new address after a move. The caller
   * writes them.
   */
  backfill: {
    recording_file_name?: string;
    video_duration_seconds?: number;
    recording_url?: string;
    recording_drive_id?: string;
    recording_item_id?: string;
  };
  /** The SharePoint file, when it was found. */
  item: ResolvedVideoItem | null;
}

/**
 * Long enough for a warm Graph call, short enough that one slow file does not
 * hold the whole recordings page. A timeout reads as "not checked", never as
 * "broken".
 */
export const DESCRIBE_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new VideoItemError('GRAPH_UNAVAILABLE')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function problemFromError(err: unknown): RecordingProblem {
  if (err instanceof VideoItemError) {
    // A stored link SharePoint no longer recognises points at nothing, which to
    // a teacher is the same thing as a file that has gone.
    if (err.code === 'NOT_FOUND' || err.code === 'LINK_NOT_RECOGNISED') return 'NOT_FOUND';
    if (err.code === 'NO_ACCESS') return 'NO_ACCESS';
  }
  return 'UNRESOLVED';
}

export async function describeTrackRecording(
  row: TrackRecordingRow,
  opts: { resolve?: (ref: VideoItemRef) => Promise<ResolvedVideoItem>; timeoutMs?: number } = {},
): Promise<TrackRecordingDescription> {
  const url = row.recording_url;
  if (!url) return { recording: null, backfill: {}, item: null };

  const fromRow = (problem: RecordingProblem | null): ResolvedRecording => ({
    // Never the link itself: describeRecordingUrl refuses to name a video after
    // a SharePoint page.
    name: describeRecordingUrl(url, row.recording_file_name),
    web_url: url,
    folder_path: null,
    size_bytes: null,
    duration_seconds: row.video_duration_seconds ?? null,
    drive_type: null,
    problem,
  });

  // An older YouTube track has no SharePoint file to look up.
  if (row.video_source === 'youtube') return { recording: fromRow(null), backfill: {}, item: null };

  const resolve = opts.resolve ?? resolveVideoItemCached;
  try {
    // By the file's ids when the row has them, so a moved folder does not break
    // the recording (lib/sharepoint-video.ts findRecordingItem).
    const { item, heal } = await withTimeout(
      findRecordingItem({ url, driveId: row.recording_drive_id, itemId: row.recording_item_id }, resolve),
      opts.timeoutMs ?? DESCRIBE_TIMEOUT_MS,
    );

    const backfill: TrackRecordingDescription['backfill'] = {};
    if (heal.url) backfill.recording_url = heal.url;
    if (heal.driveId && heal.itemId) {
      backfill.recording_drive_id = heal.driveId;
      backfill.recording_item_id = heal.itemId;
    }
    if (!row.recording_file_name && item.name) backfill.recording_file_name = item.name;
    if (!row.video_duration_seconds && item.durationSeconds) {
      backfill.video_duration_seconds = item.durationSeconds;
    }

    return {
      recording: {
        name: item.name,
        web_url: item.webUrl || url,
        folder_path: item.folderPath,
        size_bytes: item.sizeBytes,
        duration_seconds: item.durationSeconds ?? row.video_duration_seconds ?? null,
        drive_type: item.driveType,
        problem: recordingPolicyProblem(item),
      },
      backfill,
      item,
    };
  } catch (err) {
    return { recording: fromRow(problemFromError(err)), backfill: {}, item: null };
  }
}

/* ── Whether to create checkpoints ──────────────────────────────────────────── */

export type PrepareDecision = 'already_prepared' | 'needs_confirmation' | 'run';

/**
 * Checkpoints are created once, automatically. Doing it again is a choice: a new
 * transcript, or "redo". Replacing checkpoints that students have already
 * attempted strands their passed attempts on archived rows, so that needs the
 * teacher to say yes.
 */
export function decidePrepare(input: {
  sectionCount: number;
  attemptCount: number;
  redo: boolean;
  hasUpload: boolean;
  confirmedReset: boolean;
}): PrepareDecision {
  const replacing = input.redo || input.hasUpload;
  if (input.sectionCount > 0 && !replacing) return 'already_prepared';
  if (input.sectionCount > 0 && input.attemptCount > 0 && !input.confirmedReset) {
    return 'needs_confirmation';
  }
  return 'run';
}

/**
 * Blank questions out, then any checkpoint left with none. The generator can
 * produce a segment with no usable question, and saving it would lock every
 * checkpoint after it.
 */
export function withoutUnpassableCheckpoints<
  T extends { questions?: ReadonlyArray<{ question_text?: string | null }> | null },
>(sections: T[]): T[] {
  return sections
    .map((section) => ({
      ...section,
      questions: (section.questions || []).filter(
        (q) => typeof q?.question_text === 'string' && q.question_text.trim().length > 0,
      ),
    }))
    .filter((section) => section.questions.length > 0) as T[];
}

/**
 * Fill in how many questions each checkpoint serves and how many must be right.
 *
 * Moved out of the sections PUT route so checkpoints saved by "create
 * checkpoints" are stamped by exactly the same rule. Stamped server side and
 * never taken from the client, with the same resolver the student quiz grades
 * against, so what is written and what is graded cannot drift.
 */
export async function stampTrackGate<
  T extends SectionGateColumns & { questions?: ReadonlyArray<unknown> | null },
>(
  supabase: any,
  trackId: string,
  sections: T[],
): Promise<Array<T & { questions_to_serve: number; min_questions_to_pass: number }>> {
  const defaults = await readRecapDefaults(supabase);
  const { data: track } = await supabase
    .from('nexus_class_recaps')
    .select('question_pool_per_segment, questions_per_segment, pass_percentage')
    .eq('id', trackId)
    .maybeSingle();

  const wanted = Math.min(
    track?.question_pool_per_segment ?? defaults.question_pool_per_segment,
    track?.questions_per_segment ?? defaults.questions_per_segment,
  );
  const passPercentage = track?.pass_percentage ?? defaults.pass_percentage;

  return sections.map((section) => {
    const { serve, minToPass } = resolveSectionGate(section, (section.questions || []).length, {
      questionsPerSegment: wanted,
      passPercentage,
    });
    return { ...section, questions_to_serve: serve, min_questions_to_pass: minToPass };
  });
}

/** How many quiz attempts students have made on this track's live checkpoints. */
export async function countTrackAttempts(supabase: any, trackId: string): Promise<number> {
  const { data: sections } = await supabase
    .from('nexus_class_recap_sections')
    .select('id')
    .eq('recap_id', trackId)
    .is('archived_at', null);
  const ids = ((sections || []) as { id: string }[]).map((s) => s.id);
  if (!ids.length) return 0;
  const { count } = await supabase
    .from('nexus_class_recap_attempts')
    .select('id', { count: 'exact', head: true })
    .in('section_id', ids);
  return count || 0;
}

/** How many questions each track's live checkpoints hold, for "4 checkpoints, 40 questions". */
export async function countQuestionsByTrack(supabase: any, trackIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!trackIds.length) return counts;

  const { data: sections } = await supabase
    .from('nexus_class_recap_sections')
    .select('id, recap_id')
    .in('recap_id', trackIds)
    .is('archived_at', null);

  const trackOf = new Map<string, string>();
  for (const section of (sections || []) as { id: string; recap_id: string }[]) {
    trackOf.set(section.id, section.recap_id);
  }
  if (!trackOf.size) return counts;

  const { data: questions } = await supabase
    .from('nexus_class_recap_questions')
    .select('section_id')
    .in('section_id', Array.from(trackOf.keys()));

  for (const question of (questions || []) as { section_id: string }[]) {
    const trackId = trackOf.get(question.section_id);
    if (trackId) counts.set(trackId, (counts.get(trackId) || 0) + 1);
  }
  return counts;
}

/**
 * Which video a request means: the ids of a file picked in Nexus, or a pasted
 * link. Ids win, because the link SharePoint search returns for a picked file is
 * often a list form page rather than the file.
 */
export function videoRefFromBody(body: unknown): VideoItemRef | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const driveId = typeof b.drive_id === 'string' ? b.drive_id.trim() : '';
  const itemId = typeof b.item_id === 'string' ? b.item_id.trim() : '';
  if (driveId && itemId) return { driveId, itemId };

  const raw =
    typeof b.recording_url === 'string' ? b.recording_url : typeof b.url === 'string' ? b.url : '';
  const link = raw.trim();
  return link || null;
}
