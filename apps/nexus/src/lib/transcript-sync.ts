/**
 * Pull class transcripts in the background, once per class, forever.
 *
 * Until now nothing ever ran the transcript ladder on its own: the only trigger
 * was a teacher pressing "Generate from the class". So a class sat without a
 * transcript until somebody happened to open its wrap-up panel, and because the
 * ladder was broken (see lib/transcript-resolver for the two Graph bugs) even
 * that produced nothing.
 *
 * Shaped as a library rather than route code, the same way attendance-sync is,
 * so the cron and any future backfill share one implementation and cannot drift.
 *
 * COST is the design constraint here, and it is why every branch below writes
 * something down:
 *
 *  - A class that yields a transcript gets `status='ok'` and is never looked at
 *    again. One Graph call in its entire life.
 *  - A class that yields nothing gets its attempt counted, and once the count
 *    reaches MAX_TRANSCRIPT_ATTEMPTS it goes `unavailable`, which is terminal.
 *    Teams only retains so much, and a recurring meeting's older occurrences are
 *    permanently unreachable, so without this cap those classes would be retried
 *    twice a night forever.
 *  - A class whose end time has not passed is not touched at all, because
 *    calling Graph early only burns an attempt against that cap.
 */
import { CLASS_SYNC_COLUMNS, type ClassMeetingRow } from '@/lib/attendance-sync';
import { istToday } from '@/lib/class-absences';
import {
  resolveTranscript,
  recordTranscriptFailure,
  MAX_TRANSCRIPT_ATTEMPTS,
} from '@/lib/transcript-resolver';

/**
 * The ladder wants two columns attendance does not: the recording, for its last
 * rung, and the cached pointer, for its third.
 */
export const TRANSCRIPT_SYNC_COLUMNS = `${CLASS_SYNC_COLUMNS}, end_time, recording_url, transcript_url`;

type TranscriptClassRow = ClassMeetingRow & {
  end_time: string;
  recording_url: string | null;
  transcript_url: string | null;
};

export interface TranscriptSyncOptions {
  /** How far back to look. 400 covers every class this instance has ever had. */
  days?: number;
  /** Classes per run. The cron keeps this modest; a backfill raises it. */
  limit?: number;
  /** Minutes after a class ends before Teams can be expected to have published. */
  graceMinutes?: number;
}

export interface TranscriptSyncSummary {
  candidates: number;
  due: number;
  /** Transcripts found and stored this run. */
  stored: number;
  /**
   * The classes those transcripts belong to.
   *
   * This is the closest thing this stack has to a "class ended" event. There is
   * no webhook and no queue, but a transcript landing means Teams has finished
   * processing a session that ran minutes ago, which is exactly the moment the
   * recap for it can be generated. The recap pipeline reads this instead of
   * waiting for the nightly sweep.
   */
  storedClassIds: string[];
  /** Classes that produced nothing and had an attempt counted. */
  missed: number;
  /** Of those, how many hit the attempt cap and are now terminal. */
  exhausted: number;
  /** Why the misses missed, for operators reading the cron output. */
  reasons: Record<string, number>;
}

/** Turn whatever the ladder reported into one short, greppable reason. */
function missReason(result: { sharepointError?: string; meetingFailure?: string }): string {
  if (result.meetingFailure && result.meetingFailure !== 'NO_TRANSCRIPT') {
    return result.meetingFailure;
  }
  if (result.sharepointError) return result.sharepointError;
  return 'NO_TRANSCRIPT';
}

/**
 * Find every class that still needs a transcript and try to fetch it.
 *
 * Returns a plain summary, never a NextResponse, so a route, a cron and a
 * backfill can all call it.
 */
export async function syncClassTranscripts(
  supabase: any,
  options: TranscriptSyncOptions = {},
): Promise<TranscriptSyncSummary> {
  const days = Math.min(Math.max(options.days ?? 7, 1), 400);
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const graceMinutes = options.graceMinutes ?? 20;

  const today = istToday();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  const empty: TranscriptSyncSummary = {
    candidates: 0,
    due: 0,
    stored: 0,
    storedClassIds: [],
    missed: 0,
    exhausted: 0,
    reasons: {},
  };

  // A class with no meeting of any kind has nowhere for a transcript to live.
  // Cancelled classes never happened. Both are excluded in SQL rather than
  // filtered later, so they do not eat into `limit`.
  const { data: candidates, error } = await supabase
    .from('nexus_scheduled_classes')
    .select(TRANSCRIPT_SYNC_COLUMNS)
    .not('teams_meeting_join_url', 'is', null)
    .neq('status', 'cancelled')
    .eq('publish_state', 'published')
    .gte('scheduled_date', from)
    .lte('scheduled_date', today)
    .order('scheduled_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(limit * 4);

  if (error) throw error;
  const rows = (candidates || []) as TranscriptClassRow[];
  if (rows.length === 0) return empty;

  // Which of these are already settled? PostgREST has no anti-join, so this is
  // one extra round trip rather than something clever.
  const { data: existing } = await supabase
    .from('nexus_class_transcripts')
    .select('class_id, status, attempts')
    .in(
      'class_id',
      rows.map((r) => r.id),
    );

  const settled = new Map<string, { status: string; attempts: number }>(
    (existing || []).map((r: any) => [r.class_id, { status: r.status, attempts: r.attempts ?? 0 }]),
  );

  const cutoff = Date.now() - graceMinutes * 60 * 1000;
  const due = rows
    .filter((cls) => {
      const prior = settled.get(cls.id);
      if (prior?.status === 'ok') return false;
      if (prior && prior.attempts >= MAX_TRANSCRIPT_ATTEMPTS) return false;
      const endMs = new Date(
        `${cls.scheduled_date}T${(cls.end_time || '23:59').substring(0, 5)}:00+05:30`,
      ).getTime();
      return endMs < cutoff;
    })
    .slice(0, limit);

  const summary: TranscriptSyncSummary = { ...empty, candidates: rows.length, due: due.length };
  if (due.length === 0) return summary;

  // Concurrency of 3, matching the attendance sync: Graph's cloud-communications
  // endpoints throttle hard and each class is two or three calls.
  const queue = [...due];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const cls = queue.shift();
      if (!cls) break;
      try {
        const result = await resolveTranscript({ cls, supabase });
        if (result.entries.length > 0) {
          // resolveTranscript already stored it.
          summary.stored++;
          summary.storedClassIds.push(cls.id);
          continue;
        }
        const reason = missReason(result);
        const status = await recordTranscriptFailure(supabase, cls.id, reason);
        summary.missed++;
        if (status === 'unavailable') summary.exhausted++;
        summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'exception';
        summary.missed++;
        summary.reasons.exception = (summary.reasons.exception ?? 0) + 1;
        console.error(`[transcript-sync] class ${cls.id} failed:`, err);
        await recordTranscriptFailure(supabase, cls.id, reason).catch(() => {});
      }
    }
  });

  await Promise.all(workers);
  return summary;
}
