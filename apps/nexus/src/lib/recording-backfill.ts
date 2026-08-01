/**
 * Find the Teams recording for a class in the background, once per class.
 *
 * This is the gap that stalled everything downstream. `findRecordingForClass` has
 * existed and worked for a while, but nothing ever called it on a schedule: only a
 * teacher pressing Sync, Generate or Backfill. And because
 * `syncClassYouTubeBackups` selects on `recording_url IS NOT NULL`, a class nobody
 * touched was never queued for YouTube either, so Teams quietly deleted the only
 * copy after about six months. One unfilled column, an entire term of teaching at
 * risk.
 *
 * Shaped as a library rather than route code, the same way transcript-sync and
 * attendance-sync are, so the cron and any future backfill share one
 * implementation and cannot drift.
 *
 * The cost rules are the same ones transcript-sync documents, with one number
 * changed:
 *
 *  - A class that yields a link is never looked at again.
 *  - A class that yields nothing has its attempt counted, and at MAX_RECORDING_ATTEMPTS
 *    goes `unavailable`, which is terminal. Without the cap, a class Teams never
 *    recorded would be retried twice a night forever.
 *  - The grace is 60 minutes, not the transcript sweep's 20. Teams takes far
 *    longer to finalise a 300 MB mp4 than a 12 KB vtt, and calling early only
 *    burns an attempt.
 */
import { istToday } from '@/lib/class-absences';
import { findRecordingForClass, type RecordingLocatorClass } from '@/lib/recording-locator';

/**
 * Four, matching the YouTube sweep rather than the transcript sweep's six.
 * Each attempt here is several Graph list calls over a document library.
 */
export const MAX_RECORDING_ATTEMPTS = 4;

/** Teams needs far longer to publish an mp4 than a vtt. */
const DEFAULT_GRACE_MINUTES = 60;

export const RECORDING_SYNC_COLUMNS =
  'id, classroom_id, teacher_id, title, scheduled_date, start_time, end_time, ' +
  'recording_url, teams_meeting_join_url, teams_meeting_url, organizer_email, ' +
  'organizer_ms_oid, recording_sync_attempts, recording_sync_status';

interface RecordingClassRow extends RecordingLocatorClass {
  id: string;
  end_time: string | null;
  recording_url: string | null;
  organizer_ms_oid: string | null;
  recording_sync_attempts: number | null;
  recording_sync_status: string | null;
}

export interface RecordingSyncOptions {
  days?: number;
  limit?: number;
  graceMinutes?: number;
}

export interface RecordingSyncSummary {
  candidates: number;
  due: number;
  /** Links found and written this run. */
  found: number;
  /**
   * The classes those links belong to.
   *
   * Handed to the transcript sweep running next in the same request, so a class
   * whose recording was located seconds ago can have its SharePoint rung tried
   * tonight instead of tomorrow.
   */
  foundClassIds: string[];
  missed: number;
  /** Of those, how many hit the attempt cap and are now terminal. */
  exhausted: number;
}

/**
 * Note that a lookup came up empty, and decide whether the class is now terminal.
 *
 * A PostgREST error does not throw, it returns `{ error }`. Unchecked, this would
 * fail on every class forever and present as nothing worse than "the sweep is
 * slow", so it is checked explicitly.
 */
async function recordMiss(
  supabase: any,
  classId: string,
  detail: string,
  priorAttempts: number,
): Promise<'pending' | 'unavailable'> {
  const attempts = priorAttempts + 1;
  const status = attempts >= MAX_RECORDING_ATTEMPTS ? 'unavailable' : 'pending';
  const { error } = await supabase
    .from('nexus_scheduled_classes')
    .update({
      recording_sync_attempts: attempts,
      recording_sync_status: status,
      recording_sync_detail: detail.slice(0, 400),
    })
    .eq('id', classId);
  if (error) console.error(`[recording-sync] could not record miss for ${classId}:`, error);
  return status;
}

/**
 * Find every published class that still has no recording link and try to locate one.
 *
 * Returns a plain summary, never a NextResponse, so a route, a cron and a backfill
 * can all call it.
 */
export async function syncClassRecordingLinks(
  supabase: any,
  options: RecordingSyncOptions = {},
): Promise<RecordingSyncSummary> {
  const days = Math.min(Math.max(options.days ?? 7, 1), 400);
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const graceMinutes = options.graceMinutes ?? DEFAULT_GRACE_MINUTES;

  const today = istToday();
  const from = new Date(Date.now() - days * 86400000).toISOString().substring(0, 10);

  const summary: RecordingSyncSummary = {
    candidates: 0,
    due: 0,
    found: 0,
    foundClassIds: [],
    missed: 0,
    exhausted: 0,
  };

  // A draft class was never visible to anyone and a cancelled one never happened.
  // Both are excluded in SQL rather than filtered later, so they do not eat into
  // `limit`. The attempt cap is filtered here too, for the same reason.
  const { data: candidates, error } = await supabase
    .from('nexus_scheduled_classes')
    .select(RECORDING_SYNC_COLUMNS)
    .is('recording_url', null)
    .neq('status', 'cancelled')
    .eq('publish_state', 'published')
    .lt('recording_sync_attempts', MAX_RECORDING_ATTEMPTS)
    .gte('scheduled_date', from)
    .lte('scheduled_date', today)
    .order('scheduled_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(limit * 2);

  if (error) throw error;
  const rows = (candidates || []) as RecordingClassRow[];
  summary.candidates = rows.length;
  if (rows.length === 0) return summary;

  const cutoff = Date.now() - graceMinutes * 60 * 1000;
  const due = rows
    .filter((cls) => {
      if (cls.recording_sync_status === 'unavailable') return false;
      const endMs = new Date(
        `${cls.scheduled_date}T${(cls.end_time || '23:59').substring(0, 5)}:00+05:30`,
      ).getTime();
      return endMs < cutoff;
    })
    .slice(0, limit);

  summary.due = due.length;
  if (due.length === 0) return summary;

  // Concurrency of 3, matching the attendance and transcript sweeps: Graph
  // throttles hard and each class is several list calls over a drive.
  const queue = [...due];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const cls = queue.shift();
      if (!cls) break;
      try {
        // `organizer_ms_oid` is passed when the row already holds it, so a class
        // the attendance pass just resolved does not pay for the lookup twice.
        // undefined (not null) is what makes the locator resolve it itself.
        const url = await findRecordingForClass(
          supabase,
          cls,
          cls.organizer_ms_oid ?? undefined,
        );

        if (!url) {
          const status = await recordMiss(supabase, cls.id, 'NO_RECORDING', cls.recording_sync_attempts ?? 0);
          summary.missed++;
          if (status === 'unavailable') summary.exhausted++;
          continue;
        }

        const { error: writeErr } = await supabase
          .from('nexus_scheduled_classes')
          .update({
            recording_url: url,
            recording_fetched_at: new Date().toISOString(),
            recording_sync_status: 'ok',
            recording_sync_detail: null,
          })
          .eq('id', cls.id);
        if (writeErr) throw writeErr;

        summary.found++;
        summary.foundClassIds.push(cls.id);
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'exception';
        console.error(`[recording-sync] class ${cls.id} failed:`, err);
        const status = await recordMiss(supabase, cls.id, detail, cls.recording_sync_attempts ?? 0)
          .catch(() => 'pending' as const);
        summary.missed++;
        if (status === 'unavailable') summary.exhausted++;
      }
    }
  });

  await Promise.all(workers);
  return summary;
}
