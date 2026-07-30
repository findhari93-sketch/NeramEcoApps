/**
 * Back every class recording up to YouTube, in the background, once each.
 *
 * Teams deletes a class recording after about six months. Until now the only
 * thing standing between a term of teaching and that deadline was a teacher
 * remembering to download a 300 MB file and re-upload it by hand, which is why
 * the backlog exists.
 *
 * Shaped as a library rather than route code, the same way transcript-sync and
 * attendance-sync are, so the cron, an admin trigger and a backfill share one
 * implementation and cannot drift.
 *
 * COST is the design constraint, harder than anywhere else in this app:
 *
 *  - videos.insert costs 1600 of 10,000 daily quota units, and they are charged
 *    when the SESSION IS CREATED, not when the bytes land. Six failed starts is
 *    a whole day gone.
 *  - So a part-finished upload is ALWAYS resumed before any new one starts, and
 *    resumes are not capped: finishing one costs nothing and converts units
 *    already spent into an actual video, while starting a new one spends 1600
 *    that a resume would not have.
 *  - The attempt cap is 4, lower than the transcript sweep's 6, for the same
 *    reason.
 *  - A quota refusal stops the run and counts against NOBODY. It is a property
 *    of the day, not of the class, and counting it would retire classes from the
 *    queue for a reason that had nothing to do with them.
 */

import { istToday } from '@/lib/class-absences';
import { buildClassLinkPatch } from '@/lib/class-links';
import { syncClassToLibrary } from '@/lib/class-library-bridge';
import { generateVideoMetaForClass } from '@/lib/class-video-meta-ai';
import { resolveRecordingSource, fetchSlice } from '@/lib/recording-source';
import { getUploadAccessToken, YouTubeAuthError } from '@/lib/youtube-oauth';
import {
  classifyUploadResponse,
  initiateUpload,
  nextSliceBounds,
  queryUploadOffset,
  uploadChunk,
  UPLOAD_PRIVACY_STATUS,
  type VideoSnippetInput,
} from '@/lib/youtube-upload';
import { buildYouTubeTitle, buildYouTubeDescription } from '@/lib/youtube-metadata';

/** Four, not six. Each failure here can cost 1600 quota units. */
export const MAX_UPLOAD_ATTEMPTS = 4;

/** 5 x 1600 = 8000, leaving 2000 for retries, the promotion pass and slack. */
export const MAX_NEW_UPLOADS_PER_DAY = 5;
/** One run must not be able to spend the whole day on classes that then fail. */
export const MAX_NEW_UPLOADS_PER_RUN = 3;

/**
 * Teams takes far longer to finalise a 300 MB mp4 than a 12 KB vtt, so this is
 * 120 minutes where the transcript sweep uses 20.
 */
const DEFAULT_GRACE_MINUTES = 120;

/** A session Google has probably forgotten. Its 1600 units are already lost. */
const SESSION_STALE_MS = 24 * 60 * 60 * 1000;

/** Leave room to persist progress before the function is killed. */
const DEFAULT_BUDGET_MS = 240_000;

export const YOUTUBE_BACKUP_COLUMNS =
  'id, classroom_id, teacher_id, title, description, summary_bullets, scheduled_date, start_time, end_time, recording_url, youtube_url';

interface BackupClassRow {
  id: string;
  teacher_id: string | null;
  title: string | null;
  description: string | null;
  summary_bullets: unknown;
  scheduled_date: string;
  end_time: string | null;
  recording_url: string | null;
  youtube_url: string | null;
}

interface UploadRow {
  class_id: string;
  status: string;
  attempts: number;
  upload_session_uri: string | null;
  session_started_at: string | null;
  bytes_uploaded: number;
  file_size: number | null;
}

export interface YouTubeBackupOptions {
  days?: number;
  limit?: number;
  graceMinutes?: number;
  /** Wall-clock budget. The caller sets this from its own maxDuration. */
  budgetMs?: number;
  /** Report what would run and change nothing. Also the operator's preview. */
  dryRun?: boolean;
}

export interface YouTubeBackupSummary {
  candidates: number;
  due: number;
  resumed: number;
  started: number;
  completed: number;
  /** Ran out of clock part way. Not a failure: the next run continues. */
  partial: number;
  failed: number;
  exhausted: number;
  quotaBlocked: boolean;
  quotaRemaining: number;
  bytesMoved: number;
  metaGenerated: number;
  promoted: number;
  reasons: Record<string, number>;
  dryRun?: { resumes: string[]; fresh: string[] };
}

function emptySummary(): YouTubeBackupSummary {
  return {
    candidates: 0, due: 0, resumed: 0, started: 0, completed: 0, partial: 0,
    failed: 0, exhausted: 0, quotaBlocked: false, quotaRemaining: 0,
    bytesMoved: 0, metaGenerated: 0, promoted: 0, reasons: {},
  };
}

/**
 * The UTC instant of the most recent midnight in Los Angeles.
 *
 * YouTube's daily quota resets at Pacific midnight, not UTC and not IST. Counting
 * against the wrong boundary makes the cap either leak (three runs each believing
 * they have a fresh day) or lock out early.
 */
export function pacificDayStartUtc(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  });

  /** The Pacific calendar day and hour of a UTC instant. */
  const inPacific = (d: Date) => {
    const p = fmt.formatToParts(d);
    const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: get('hour') };
  };

  const today = inPacific(now).day;

  // Pacific is UTC-7 in summer and UTC-8 in winter. Probe both and keep the one
  // that lands on midnight, which is DST-correct without a timezone library.
  //
  // Matching only the calendar DAY is not enough and was the original bug here:
  // in July both 07:00Z and 08:00Z fall on the same Pacific date (00:00 and
  // 01:00), so the day check accepted 08:00Z and the quota window started an
  // hour late every summer.
  for (const offset of [7, 8]) {
    const candidate = new Date(`${today}T00:00:00.000Z`);
    candidate.setUTCHours(candidate.getUTCHours() + offset);
    const back = inPacific(candidate);
    if (back.day === today && back.hour === '00') return candidate.toISOString();
  }
  return new Date(`${today}T08:00:00.000Z`).toISOString();
}

/** How many new sessions this run may open. */
export function uploadBudget(startedToday: number, perDay: number, perRun: number): number {
  return Math.max(0, Math.min(perDay - startedToday, perRun));
}

/** Everything a class needs to become a YouTube listing, however it got written. */
async function resolveSnippet(supabase: any, cls: BackupClassRow): Promise<VideoSnippetInput> {
  const { data: meta } = await supabase
    .from('nexus_class_video_meta')
    .select('yt_title, yt_description, yt_tags, language, chapters')
    .eq('scheduled_class_id', cls.id)
    .maybeSingle();

  if (meta?.yt_title) {
    return {
      title: meta.yt_title,
      description: meta.yt_description || '',
      tags: meta.yt_tags || [],
      language: meta.language,
      chapters: Array.isArray(meta.chapters) ? meta.chapters : [],
    };
  }

  // No listing, because the AI step failed or was rate limited. Upload anyway.
  // A mediocre title on a saved recording beats a perfect title on a recording
  // Teams has already deleted, and the teacher is going into Studio to flip the
  // privacy regardless, so fixing it there costs them nothing extra.
  const bullets = Array.isArray(cls.summary_bullets) ? (cls.summary_bullets as string[]) : [];
  return {
    title: buildYouTubeTitle({
      topic: cls.title || 'Neram class recording',
      exam: null, subject: null, language: null,
    }),
    description: buildYouTubeDescription({
      hook: cls.description || '',
      bullets,
      chapters: [],
      topics: [],
      searchTerms: [],
      exam: null, difficulty: null, language: null,
      classDate: cls.scheduled_date,
    }),
    tags: [],
    language: null,
  };
}

/** Note a failure and decide whether the class is now terminal. */
async function recordFailure(
  supabase: any,
  classId: string,
  detail: string,
  priorAttempts: number,
): Promise<'pending' | 'unavailable'> {
  const attempts = priorAttempts + 1;
  const status = attempts >= MAX_UPLOAD_ATTEMPTS ? 'unavailable' : 'pending';
  await supabase.from('nexus_class_video_uploads').upsert(
    { class_id: classId, status, detail: detail.slice(0, 400), attempts },
    { onConflict: 'class_id' },
  );
  return status;
}

interface TransferOutcome {
  kind: 'done' | 'partial' | 'failed' | 'quota';
  videoId?: string;
  detail?: string;
  bytes: number;
}

/**
 * Move bytes until the file is done or the clock runs out.
 *
 * Advances ONLY from the offset Google confirms. Trusting `start + length`
 * instead is the bug that writes a chunk over a gap and produces a video that is
 * corrupt in the middle, which no status code ever reports.
 */
async function transfer(
  sessionUri: string,
  downloadUrl: string,
  total: number,
  startOffset: number,
  deadline: number,
  onProgress: (offset: number) => Promise<void>,
  fetchImpl: typeof fetch = fetch,
): Promise<TransferOutcome> {
  let offset = startOffset;
  let moved = 0;
  let estimatedChunkMs = 8000;
  let consecutiveRetries = 0;

  while (offset < total) {
    if (Date.now() + estimatedChunkMs > deadline) {
      return { kind: 'partial', bytes: moved };
    }

    const { start, length } = nextSliceBounds(offset, total);
    const began = Date.now();

    let slice: Uint8Array;
    try {
      slice = await fetchSlice(downloadUrl, start, length, fetchImpl);
    } catch (err) {
      return {
        kind: 'failed',
        detail: err instanceof Error ? err.message : 'slice fetch failed',
        bytes: moved,
      };
    }

    const verdict = await uploadChunk(sessionUri, slice, start, total, fetchImpl);

    if (verdict.kind === 'resume') {
      consecutiveRetries = 0;
      moved += Math.max(0, verdict.next - offset);
      offset = verdict.next;
      estimatedChunkMs = Math.max(1000, Date.now() - began);
      await onProgress(offset);
      continue;
    }

    if (verdict.kind === 'done') {
      moved += total - offset;
      return { kind: 'done', videoId: verdict.videoId, bytes: moved };
    }

    if (verdict.kind === 'retry') {
      if (++consecutiveRetries > 5) {
        return { kind: 'failed', detail: `5xx x${consecutiveRetries}`, bytes: moved };
      }
      // Ask where Google actually is rather than resending blind. Backoff is
      // capped so a 5xx storm cannot eat the whole budget.
      await new Promise((r) => setTimeout(r, Math.min(16000, 1000 * 2 ** consecutiveRetries)));
      const probe = await queryUploadOffset(sessionUri, total, fetchImpl);
      if (probe.kind === 'resume') { offset = probe.next; await onProgress(offset); continue; }
      if (probe.kind === 'done') return { kind: 'done', videoId: probe.videoId, bytes: moved };
      return { kind: 'failed', detail: `retry probe: ${probe.kind}`, bytes: moved };
    }

    if (verdict.kind === 'quota') return { kind: 'quota', detail: verdict.reason, bytes: moved };
    if (verdict.kind === 'session_dead') return { kind: 'failed', detail: 'session_dead', bytes: moved };
    return { kind: 'failed', detail: verdict.detail, bytes: moved };
  }

  // Ran off the end without a terminal response. Ask.
  const final = await queryUploadOffset(sessionUri, total, fetchImpl);
  if (final.kind === 'done') return { kind: 'done', videoId: final.videoId, bytes: moved };
  return { kind: 'partial', bytes: moved };
}

/**
 * Publish anything the teacher has since flipped off private.
 *
 * The cron uploads as private, because an unaudited API project cannot do
 * otherwise, so it must NOT write youtube_url or call syncClassToLibrary at
 * upload time: the bridge hard-codes privacy_status 'unlisted' and
 * is_published true, which would give students a Library card with a dead
 * player and a row that lies about its own privacy.
 *
 * One videos.list call covers 50 ids for 1 quota unit, so asking every run is
 * effectively free, and the teacher's single click in Studio becomes the real
 * publish trigger with no new UI anywhere.
 */
async function promotePublicVideos(
  supabase: any,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const { data: rows } = await supabase
    .from('nexus_class_video_uploads')
    .select('class_id, youtube_video_id')
    .eq('status', 'ok')
    .eq('privacy_status', 'private')
    .not('youtube_video_id', 'is', null)
    .limit(50);

  const pending = (rows || []) as { class_id: string; youtube_video_id: string }[];
  if (!pending.length) return 0;

  const ids = pending.map((r) => r.youtube_video_id).join(',');
  const res = await fetchImpl(
    `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(ids)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return 0;

  const json = await res.json().catch(() => ({}));
  const live = new Map<string, string>(
    (json?.items || []).map((i: any) => [i.id, i.status?.privacyStatus]),
  );

  let promoted = 0;
  for (const row of pending) {
    const privacy = live.get(row.youtube_video_id);
    if (!privacy || privacy === 'private') continue;

    // Canonicalise through the same validator every other write path uses, so
    // the Library dedupe on youtube_video_id stays honest.
    const links = buildClassLinkPatch({
      youtube_url: `https://www.youtube.com/watch?v=${row.youtube_video_id}`,
    });
    if (!links.ok) continue;

    await supabase.from('nexus_scheduled_classes').update(links.patch).eq('id', row.class_id);
    await supabase
      .from('nexus_class_video_uploads')
      .update({ privacy_status: privacy })
      .eq('class_id', row.class_id);
    await supabase
      .from('nexus_class_video_meta')
      .update({ status: 'published' })
      .eq('scheduled_class_id', row.class_id);

    // Best effort, exactly as the PATCH route treats it: a Library hiccup must
    // not undo an upload that succeeded.
    try {
      await syncClassToLibrary(supabase, row.class_id);
    } catch (err) {
      console.error(`[yt-backup] library sync failed for ${row.class_id}:`, err);
    }
    promoted++;
  }
  return promoted;
}

/**
 * Find every class that still needs a YouTube backup and move it along.
 *
 * Returns a plain summary, never a NextResponse, so a route, a cron and a
 * backfill can all call it.
 */
export async function syncClassYouTubeBackups(
  supabase: any,
  options: YouTubeBackupOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<YouTubeBackupSummary> {
  const days = Math.min(Math.max(options.days ?? 30, 1), 400);
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const graceMinutes = options.graceMinutes ?? DEFAULT_GRACE_MINUTES;
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);

  const summary = emptySummary();
  const today = istToday();
  const from = new Date(Date.now() - days * 86400000).toISOString().substring(0, 10);

  const { data: candidates, error } = await supabase
    .from('nexus_scheduled_classes')
    .select(YOUTUBE_BACKUP_COLUMNS)
    .not('recording_url', 'is', null)
    .is('youtube_url', null)
    .neq('status', 'cancelled')
    .eq('publish_state', 'published')
    .gte('scheduled_date', from)
    .lte('scheduled_date', today)
    .order('scheduled_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(limit * 4);

  if (error) throw error;
  const rows = (candidates || []) as BackupClassRow[];
  summary.candidates = rows.length;
  if (!rows.length) return summary;

  // PostgREST has no anti-join, so this is one extra round trip rather than
  // something clever. Same shape as transcript-sync.
  const { data: existing } = await supabase
    .from('nexus_class_video_uploads')
    .select('class_id, status, attempts, upload_session_uri, session_started_at, bytes_uploaded, file_size')
    .in('class_id', rows.map((r) => r.id));

  const prior = new Map<string, UploadRow>((existing || []).map((r: any) => [r.class_id, r]));
  const cutoff = Date.now() - graceMinutes * 60 * 1000;

  const due = rows.filter((cls) => {
    const p = prior.get(cls.id);
    if (p && ['ok', 'unavailable', 'skipped'].includes(p.status)) return false;
    if (p && p.attempts >= MAX_UPLOAD_ATTEMPTS) return false;
    const endMs = new Date(
      `${cls.scheduled_date}T${(cls.end_time || '23:59').substring(0, 5)}:00+05:30`,
    ).getTime();
    return endMs < cutoff;
  }).slice(0, limit);

  summary.due = due.length;
  if (!due.length) return summary;

  // A live session is worth more than any fresh start, so it goes first and is
  // never capped.
  const isLiveResume = (cls: BackupClassRow) => {
    const p = prior.get(cls.id);
    if (!p?.upload_session_uri || p.status !== 'uploading') return false;
    const started = p.session_started_at ? new Date(p.session_started_at).getTime() : 0;
    return Date.now() - started < SESSION_STALE_MS;
  };
  const resumes = due.filter(isLiveResume);
  const fresh = due.filter((c) => !isLiveResume(c));

  const { count } = await supabase
    .from('nexus_class_video_uploads')
    .select('class_id', { count: 'exact', head: true })
    .gte('session_started_at', pacificDayStartUtc());

  let budget = uploadBudget(count ?? 0, MAX_NEW_UPLOADS_PER_DAY, MAX_NEW_UPLOADS_PER_RUN);
  summary.quotaRemaining = budget;

  if (options.dryRun) {
    summary.dryRun = { resumes: resumes.map((c) => c.id), fresh: fresh.slice(0, budget).map((c) => c.id) };
    return summary;
  }

  let accessToken: string;
  try {
    accessToken = await getUploadAccessToken(supabase, fetchImpl);
  } catch (err) {
    // A dead or missing grant is nobody's class's fault. Report it and touch no
    // attempt counter, or an admin fixing the connection would come back to a
    // queue that had quietly retired itself.
    const revoked = err instanceof YouTubeAuthError && err.revoked;
    summary.reasons[revoked ? 'oauth_revoked' : 'oauth_error'] = 1;
    return summary;
  }

  try {
    summary.promoted = await promotePublicVideos(supabase, accessToken, fetchImpl);
  } catch (err) {
    console.error('[yt-backup] promotion pass failed:', err);
  }

  // Sequential, not the concurrency-3 the transcript sweep uses: the binding
  // constraint here is quota, not latency, and three concurrent 300 MB
  // transfers would triple memory and fight for the same bandwidth.
  for (const cls of [...resumes, ...fresh]) {
    if (Date.now() > deadline) break;

    const p = prior.get(cls.id);
    const resuming = isLiveResume(cls);
    if (!resuming) {
      if (budget <= 0) break;
    }

    try {
      const source = await resolveRecordingSource(cls.recording_url as string);

      let sessionUri = resuming ? (p?.upload_session_uri as string) : null;
      let offset = resuming ? Number(p?.bytes_uploaded || 0) : 0;

      if (!sessionUri) {
        // Metadata first: it is seconds, the upload is minutes, and the snippet
        // has to go into the initiate body.
        const outcome = await generateVideoMetaForClass(supabase, cls.id);
        if (outcome.status === 'generated') summary.metaGenerated++;

        const snippet = await resolveSnippet(supabase, cls);
        const init = await initiateUpload(accessToken, snippet, source.size, fetchImpl);

        if (init.quotaReason) {
          summary.quotaBlocked = true;
          summary.reasons[init.quotaReason] = (summary.reasons[init.quotaReason] ?? 0) + 1;
          break;
        }
        if (!init.ok || !init.sessionUri) {
          const status = await recordFailure(supabase, cls.id, init.error || 'initiate failed', p?.attempts ?? 0);
          summary.failed++;
          if (status === 'unavailable') summary.exhausted++;
          summary.reasons.initiate = (summary.reasons.initiate ?? 0) + 1;
          continue;
        }

        sessionUri = init.sessionUri;
        budget--;
        summary.started++;

        // Persist BEFORE a single byte moves. The 1600 units are already spent,
        // and this row is the only thing that can recover them.
        await supabase.from('nexus_class_video_uploads').upsert(
          {
            class_id: cls.id,
            status: 'uploading',
            upload_session_uri: sessionUri,
            session_started_at: new Date().toISOString(),
            file_size: source.size,
            bytes_uploaded: 0,
            source_item_id: source.itemId,
            detail: null,
          },
          { onConflict: 'class_id' },
        );
      } else {
        summary.resumed++;
      }

      const result = await transfer(
        sessionUri, source.downloadUrl, source.size, offset, deadline,
        async (next) => {
          await supabase
            .from('nexus_class_video_uploads')
            .update({ bytes_uploaded: next })
            .eq('class_id', cls.id);
        },
        fetchImpl,
      );

      summary.bytesMoved += result.bytes;

      if (result.kind === 'done') {
        await supabase.from('nexus_class_video_uploads').update({
          status: 'ok',
          youtube_video_id: result.videoId,
          privacy_status: UPLOAD_PRIVACY_STATUS,
          uploaded_at: new Date().toISOString(),
          upload_session_uri: null,
          bytes_uploaded: source.size,
          detail: null,
        }).eq('class_id', cls.id);

        // 'ready', not 'published'. The video is private, so the class stays in
        // the needs-attention queue until the teacher flips it and the promotion
        // pass sees it.
        await supabase
          .from('nexus_class_video_meta')
          .update({ status: 'ready' })
          .eq('scheduled_class_id', cls.id);

        summary.completed++;
        continue;
      }

      if (result.kind === 'partial') { summary.partial++; continue; }

      if (result.kind === 'quota') {
        summary.quotaBlocked = true;
        summary.reasons[result.detail || 'quota'] = (summary.reasons[result.detail || 'quota'] ?? 0) + 1;
        break;
      }

      // A dead session's units are gone; clear it so the next run starts clean
      // rather than resuming against a URI Google has forgotten.
      const detail = result.detail || 'transfer failed';
      await supabase.from('nexus_class_video_uploads').update({
        upload_session_uri: null, bytes_uploaded: 0,
      }).eq('class_id', cls.id);
      const status = await recordFailure(supabase, cls.id, detail, p?.attempts ?? 0);
      summary.failed++;
      if (status === 'unavailable') summary.exhausted++;
      summary.reasons[detail] = (summary.reasons[detail] ?? 0) + 1;
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'exception';
      console.error(`[yt-backup] class ${cls.id} failed:`, err);
      const status = await recordFailure(supabase, cls.id, detail, p?.attempts ?? 0).catch(() => 'pending');
      summary.failed++;
      if (status === 'unavailable') summary.exhausted++;
      summary.reasons[detail] = (summary.reasons[detail] ?? 0) + 1;
    }
  }

  return summary;
}
