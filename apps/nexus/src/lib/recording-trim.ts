/**
 * Recording trims, the server side: which classes get trimmed, and each step a
 * trim job goes through.
 *
 * The heavy work (downloading a 100 to 370 MB recording, ffmpeg, uploading the
 * cut copy) runs on a GitHub Actions runner (scripts/recording-trim/worker.mjs),
 * because a Vercel function cannot run ffmpeg over a file that size. The runner
 * talks to Nexus through one route (app/api/internal/recording-trim), which
 * calls the functions here:
 *
 *   claim     enqueue anything new, take one job, hand over a download URL
 *             and where speech is (transcript cue times)
 *   plan      the runner's measurements in, the cuts out (recording-trim-plan)
 *   upload    an upload session for the trimmed copy beside the original
 *   complete  the trimmed copy is in place: record it and switch the class
 *             over, now or in the overnight window
 *   fail      give up on this attempt (claim retries up to three)
 *   apply     the overnight pass: switch every trim waiting for it
 *
 * Off unless the staff.auto-trim flag is on. The nexus_settings key
 * 'recording_trim' chooses dry_run (measure and plan only) or apply, and
 * whether past classes are queued too.
 */

import { getNexusSetting } from '@neram/database';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from './feature-flags';
import { parseVTT } from './vtt-parser';
import { resolveVideoItem } from './sharepoint-video';
import { resolveRecordingSourceByIds } from './recording-source';
import { createTrimUploadSession, ensureTrimFolder, getDriveItem, trimmedFileName } from './recording-trim-graph';
import { planTrim, type Span, type TrimParams } from './recording-trim-plan';
import { buildCutMap, outputDuration } from './trim-map';
import { switchRecordingTrim, type TrimRecord } from './recording-trim-apply';

export const TRIM_SETTING_KEY = 'recording_trim';
export const TRIM_FLAG = 'staff.auto-trim';

export interface TrimConfig {
  enabled: boolean;
  mode: 'dry_run' | 'apply';
  /** Queue past classes too, not just new ones. */
  backlog: boolean;
  params: Partial<TrimParams>;
}

/** How far back "past classes" goes: this academic year's recordings. */
const BACKLOG_DAYS = 150;
/** A class is trimmed once its recording has settled. */
const SETTLE_MINUTES = 60;

export async function readTrimConfig(): Promise<TrimConfig> {
  const [flags, setting] = await Promise.all([getNexusSetting(FEATURE_FLAGS_KEY), getNexusSetting(TRIM_SETTING_KEY)]);
  const enabled = isFeatureEnabled(TRIM_FLAG, resolveFlags((flags?.value as Record<string, boolean>) || {}));
  const value = (setting?.value ?? {}) as Partial<TrimConfig>;
  return {
    enabled,
    mode: value.mode === 'apply' ? 'apply' : 'dry_run',
    backlog: value.backlog === true,
    params: (value.params ?? {}) as Partial<TrimParams>,
  };
}

function istDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Queue classes with a recording that have no trim yet. New classes first; past
 * classes only when the backlog switch is on.
 */
export async function enqueueRecordingTrims(supabase: any, config: TrimConfig, limit = 20): Promise<number> {
  let query = supabase
    .from('nexus_scheduled_classes')
    .select('id, scheduled_date, end_time, recording_url')
    .not('recording_url', 'is', null)
    .neq('status', 'cancelled')
    .eq('publish_state', 'published')
    .gte('scheduled_date', istDate(config.backlog ? -BACKLOG_DAYS : -2))
    .lte('scheduled_date', istDate())
    .order('scheduled_date', { ascending: false })
    .limit(200);
  const { data: classes, error } = await query;
  if (error || !classes?.length) return 0;

  const ids = classes.map((c: any) => c.id);
  const { data: existing } = await supabase.from('nexus_recording_trims').select('class_id').in('class_id', ids);
  const has = new Set((existing ?? []).map((r: any) => r.class_id));
  const yesterday = istDate(-1);
  const now = Date.now();

  const rows = classes
    .filter((c: any) => !has.has(c.id))
    .filter((c: any) => {
      // Settled: an hour after the class ended (IST), so the recording is final.
      if (!c.end_time) return true;
      const end = Date.parse(`${c.scheduled_date}T${c.end_time}+05:30`);
      return !Number.isFinite(end) || now - end >= SETTLE_MINUTES * 60_000;
    })
    .slice(0, limit)
    .map((c: any) => ({
      class_id: c.id,
      original_url: c.recording_url,
      source: c.scheduled_date >= yesterday ? 'new' : 'backlog',
      status: 'queued',
    }));
  if (!rows.length) return 0;
  const { error: insertError } = await supabase
    .from('nexus_recording_trims')
    .upsert(rows, { onConflict: 'class_id', ignoreDuplicates: true });
  return insertError ? 0 : rows.length;
}

/** Transcript cue times, which say where speech is better than an audio threshold. */
async function speechSpans(supabase: any, classId: string): Promise<Span[]> {
  const { data } = await supabase
    .from('nexus_class_transcripts')
    .select('vtt, vtt_original, status')
    .eq('class_id', classId)
    .maybeSingle();
  const vtt = data?.vtt_original ?? (data?.status === 'ok' ? data?.vtt : null);
  if (!vtt) return [];
  return parseVTT(vtt)
    .filter((cue) => cue.end > cue.start)
    .map((cue) => [cue.start, cue.end] as Span);
}

export interface ClaimedJob {
  job_id: string;
  class_id: string;
  mode: 'dry_run' | 'apply';
  original: { download_url: string; size: number; name: string };
  speech: Span[];
  params: Partial<TrimParams>;
}

export async function claimTrimJob(supabase: any, run: string): Promise<ClaimedJob | null> {
  const config = await readTrimConfig();
  if (!config.enabled) return null;
  await enqueueRecordingTrims(supabase, config);

  // A job whose original cannot be read is failed and the next one is tried.
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase.rpc('nexus_claim_recording_trim', { p_worker: run });
    if (error) throw error;
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) return null;
    try {
      const item = await resolveVideoItem(job.original_url);
      const source = await resolveRecordingSourceByIds(item.driveId, item.itemId);
      await supabase
        .from('nexus_recording_trims')
        .update({
          original_drive_id: item.driveId,
          original_item_id: item.itemId,
          original_size: source.size,
          original_duration_seconds: item.durationSeconds ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      return {
        job_id: job.id,
        class_id: job.class_id,
        mode: config.mode,
        original: { download_url: source.downloadUrl, size: source.size, name: item.name },
        speech: await speechSpans(supabase, job.class_id),
        params: config.params,
      };
    } catch (err) {
      await failTrimJob(supabase, job.id, 'SOURCE_UNREADABLE', err instanceof Error ? err.message : String(err));
    }
  }
  return null;
}

export interface PlanReport {
  duration: number;
  silences: Span[];
  freezes: Span[];
  keyframes: number[];
  probe?: Record<string, unknown>;
}

export async function planTrimJob(
  supabase: any,
  jobId: string,
  report: PlanReport,
): Promise<{ keep: Span[] } | { skip: string }> {
  const { data: job } = await supabase.from('nexus_recording_trims').select('id, class_id, status').eq('id', jobId).maybeSingle();
  if (!job || job.status !== 'running') return { skip: 'NOT_RUNNING' };
  const config = await readTrimConfig();
  const speech = await speechSpans(supabase, job.class_id);
  const plan = planTrim({
    duration: report.duration,
    speech,
    silences: report.silences,
    freezes: report.freezes,
    keyframes: report.keyframes,
    params: config.params,
  });

  const detection = {
    duration: report.duration,
    silences: report.silences.length,
    freezes: report.freezes.length,
    keyframes: report.keyframes.length,
    speech_cues: speech.length,
    probe: report.probe ?? null,
  };
  const base = { detection, plan, original_duration_seconds: report.duration, updated_at: new Date().toISOString() };

  if (plan.kind === 'skip') {
    await supabase.from('nexus_recording_trims').update({ ...base, status: 'skipped', reason: plan.reason }).eq('id', jobId);
    return { skip: plan.reason };
  }
  if (config.mode === 'dry_run') {
    await supabase
      .from('nexus_recording_trims')
      .update({ ...base, status: 'dry_run', removed_seconds: plan.removedSeconds })
      .eq('id', jobId);
    return { skip: 'DRY_RUN' };
  }
  await supabase.from('nexus_recording_trims').update({ ...base, removed_seconds: plan.removedSeconds }).eq('id', jobId);
  return { keep: plan.keep as Span[] };
}

export async function openTrimUpload(supabase: any, jobId: string): Promise<{ upload_url: string; file_name: string }> {
  const { data: job } = await supabase
    .from('nexus_recording_trims')
    .select('status, original_drive_id, original_item_id')
    .eq('id', jobId)
    .maybeSingle();
  if (!job || job.status !== 'running' || !job.original_drive_id || !job.original_item_id) throw new Error('NOT_RUNNING');
  const original = await getDriveItem(job.original_drive_id, job.original_item_id);
  if (!original.parentId) throw new Error('NO_PARENT_FOLDER');
  const folderId = await ensureTrimFolder(original.driveId, original.parentId);
  const fileName = trimmedFileName(original.name);
  return { upload_url: await createTrimUploadSession(original.driveId, folderId, fileName), file_name: fileName };
}

export interface CompleteReport {
  /** Each kept stretch as cut: where it was in the original, how long it came out. */
  segments: Array<{ src_start: number; src_end: number; out_len: number }>;
  output_duration: number;
  item: { id: string; driveId: string };
}

/** Night-time window, IST, in which a trim is switched in for a class students have started. */
export function inApplyWindow(now = new Date()): boolean {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 90 && minutes < 300; // 01:30 to 05:00
}

async function hasStudentProgress(supabase: any, classId: string): Promise<boolean> {
  const { data: recaps } = await supabase.from('nexus_class_recaps').select('id').eq('scheduled_class_id', classId);
  const ids = (recaps ?? []).map((r: any) => r.id);
  if (!ids.length) return false;
  const { count } = await supabase
    .from('nexus_class_recap_progress')
    .select('student_id', { count: 'exact', head: true })
    .in('recap_id', ids)
    .or('watched_seconds.gt.0,last_video_position_seconds.gt.0');
  return (count ?? 0) > 0;
}

export async function completeTrimJob(supabase: any, jobId: string, report: CompleteReport): Promise<{ status: string }> {
  const { data: job } = await supabase.from('nexus_recording_trims').select('*').eq('id', jobId).maybeSingle();
  if (!job || job.status !== 'running') return { status: 'NOT_RUNNING' };

  // Trust the item as Graph reports it, not as the runner does.
  const item = await getDriveItem(report.item.driveId, report.item.id);
  const map = buildCutMap(
    report.segments.map((s) => [s.src_start, s.src_end] as Span),
    report.segments.map((s) => s.out_len),
  );
  const outDuration = outputDuration(map);
  if (Math.abs(outDuration - report.output_duration) > 2) {
    await failTrimJob(supabase, jobId, 'DURATION_MISMATCH', `${outDuration} vs ${report.output_duration}`);
    return { status: 'failed' };
  }

  const removed = Math.max(0, (Number(job.original_duration_seconds) || 0) - outDuration);
  const { data: updated } = await supabase
    .from('nexus_recording_trims')
    .update({
      status: 'ready',
      trimmed_url: item.webUrl,
      trimmed_drive_id: item.driveId,
      trimmed_item_id: item.itemId,
      trimmed_size: item.size,
      trimmed_duration_seconds: outDuration,
      cut_map: map,
      removed_seconds: removed,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select('*')
    .maybeSingle();

  // A class nobody has started switches now; one with students part-way
  // through waits for the overnight window.
  if (!(await hasStudentProgress(supabase, job.class_id)) || inApplyWindow()) {
    await switchRecordingTrim(supabase, updated as TrimRecord, 'apply', null);
    return { status: 'applied' };
  }
  return { status: 'ready' };
}

export async function failTrimJob(supabase: any, jobId: string, reason: string, detail?: string): Promise<void> {
  await supabase
    .from('nexus_recording_trims')
    .update({
      status: 'failed',
      reason: reason.slice(0, 64),
      detection: detail ? { error: detail.slice(0, 500) } : undefined,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/** The overnight pass: switch in every trim that was waiting for it. */
export async function applyReadyTrims(supabase: any, limit = 20): Promise<{ applied: number; failed: number }> {
  if (!inApplyWindow()) return { applied: 0, failed: 0 };
  const config = await readTrimConfig();
  if (!config.enabled || config.mode !== 'apply') return { applied: 0, failed: 0 };
  const { data: ready } = await supabase
    .from('nexus_recording_trims')
    .select('*')
    .eq('status', 'ready')
    .order('created_at')
    .limit(limit);
  let applied = 0;
  let failed = 0;
  for (const trim of ready ?? []) {
    try {
      await switchRecordingTrim(supabase, trim as TrimRecord, 'apply', null);
      applied++;
    } catch (err) {
      failed++;
      console.error('[recording-trim] apply failed', trim.id, err instanceof Error ? err.message : err);
    }
  }
  return { applied, failed };
}

/** How long a new class's recap waits for its recording to be trimmed. */
const TRIM_WAIT_MINUTES = 120;

/**
 * Classes whose recap should not be drafted yet, because their recording is
 * about to be trimmed: drafting first would build checkpoints on the untrimmed
 * timeline and then move them. Bounded, so a stuck trim never holds a recap
 * back for more than two hours (it is applied later and moves the recap then).
 *
 * `endedAt` gives each class's end time in ms, for classes with no trim row yet
 * (the worker queues them every 15 minutes).
 */
export async function classesAwaitingTrim(
  supabase: any,
  classIds: string[],
  endedAt: (classId: string) => number | null,
): Promise<Set<string>> {
  const waiting = new Set<string>();
  if (!classIds.length) return waiting;
  const config = await readTrimConfig().catch(() => null);
  if (!config?.enabled || config.mode !== 'apply') return waiting;

  const { data: trims, error } = await supabase
    .from('nexus_recording_trims')
    .select('class_id, status, created_at')
    .in('class_id', classIds);
  if (error) return waiting;
  const byClass = new Map<string, { status: string; created_at: string }>(
    (trims ?? []).map((t: any) => [t.class_id, t]),
  );
  const now = Date.now();
  for (const id of classIds) {
    const trim = byClass.get(id);
    if (trim) {
      const fresh = now - Date.parse(trim.created_at) < TRIM_WAIT_MINUTES * 60_000;
      if (fresh && (trim.status === 'queued' || trim.status === 'running')) waiting.add(id);
      continue;
    }
    const end = endedAt(id);
    if (end !== null && now - end < (SETTLE_MINUTES + TRIM_WAIT_MINUTES) * 60_000) waiting.add(id);
  }
  return waiting;
}
