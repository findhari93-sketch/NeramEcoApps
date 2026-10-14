/**
 * Records one watch heartbeat for a recap or a Foundation chapter track (both
 * live in nexus_class_recap_progress). Shared by the two progress routes.
 *
 * A v2 body (cumulative, see lib/watch-ledger.ts) goes through the ledger and
 * nexus_apply_recap_watch. Anything else is a page still open on the previous
 * build, and takes the old delta path unchanged so it keeps working until it
 * reloads.
 */

import { applyWatchReport, parseWatchReport, prefixEnd, readStoredWatch, storedRanges } from './watch-ledger';
import { creditedPlayedUntil } from './watch-progress';
import type { PlayedRange } from './played-ranges';

const PROGRESS_COLUMNS =
  'played_ranges, watch_sessions, watch_version, last_video_position_seconds, watched_seconds';

export interface RecordWatchResult {
  ok: boolean;
  credited: number;
}

// `any`: the nexus_* tables and RPCs are absent from database.generated.ts,
// the same convention the recap routes use.
async function recordLegacy(supabase: any, studentId: string, recapId: string, body: any): Promise<RecordWatchResult> {
  const int = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  };
  const { error } = await supabase.rpc('nexus_bump_recap_progress', {
    p_student: studentId,
    p_recap: recapId,
    p_pos: int(body?.last_video_position_seconds),
    p_watched_delta: int(body?.watched_delta_seconds),
    p_duration: int(body?.duration_seconds),
  });
  // The old recap route never recorded refused seeks; only the track route did.
  const blocked = Math.min(50, int(body?.blocked_seeks_delta));
  if (!error && blocked > 0) {
    await supabase.rpc('nexus_increment_blocked_seeks', { p_student: studentId, p_recap: recapId, p_delta: blocked });
  }
  return { ok: !error, credited: error ? 0 : int(body?.watched_delta_seconds) };
}

/**
 * The code can reach a database the migration has not yet: the new columns or
 * the new function are missing. PostgREST reports those as PGRST204/PGRST202,
 * Postgres as 42703/42883.
 */
function isMissingSchema(error: { code?: string; message?: string }): boolean {
  return (
    ['PGRST202', 'PGRST204', '42883', '42703'].includes(error?.code ?? '') ||
    /nexus_apply_recap_watch|played_ranges|watch_sessions|watch_version/.test(error?.message ?? '')
  );
}

/**
 * Keep the resume point the old way rather than failing the request. Nothing
 * is credited, and the client keeps its totals to resend once the ledger exists.
 */
async function recordPositionOnly(supabase: any, studentId: string, recapId: string, position: number, duration: number) {
  await supabase.rpc('nexus_bump_recap_progress', {
    p_student: studentId,
    p_recap: recapId,
    p_pos: position,
    p_watched_delta: 0,
    p_duration: duration,
  });
  return { ok: false, credited: 0 };
}

export async function recordWatchReport(
  supabase: any,
  studentId: string,
  recapId: string,
  body: unknown,
): Promise<RecordWatchResult> {
  const report = parseWatchReport(body);
  if (!report) return recordLegacy(supabase, studentId, recapId, body);

  // Two flushes can land together (a keepalive on unload overlapping the
  // interval one). The version check makes the loser re-read and re-apply, and
  // because reports are cumulative, re-applying is always safe.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error: readError } = await supabase
      .from('nexus_class_recap_progress')
      .select(PROGRESS_COLUMNS)
      .eq('student_id', studentId)
      .eq('recap_id', recapId)
      .maybeSingle();
    if (readError) {
      if (isMissingSchema(readError)) {
        return recordPositionOnly(supabase, studentId, recapId, report.position, report.duration);
      }
      throw readError;
    }

    const update = applyWatchReport(readStoredWatch(row), report, Date.now());
    const { data: applied, error } = await supabase.rpc('nexus_apply_recap_watch', {
      p_student: studentId,
      p_recap: recapId,
      p_expected_version: Number(row?.watch_version) || 0,
      p_pos: report.position,
      p_credit: update.credit,
      p_ranges: update.ranges,
      p_sessions: update.sessions,
      p_blocked: update.blockedDelta,
      p_duration: report.duration,
      p_diag: update.diagnosticsDelta,
      p_user_agent: report.userAgent,
    });
    if (error) {
      if (isMissingSchema(error)) {
        return recordPositionOnly(supabase, studentId, recapId, report.position, report.duration);
      }
      throw error;
    }
    if (applied === true) return { ok: true, credited: update.credit };
  }
  // Lost the race three times. Nothing is lost either: the client resends the
  // same cumulative totals on its next flush.
  return { ok: false, credited: 0 };
}

export interface WatchProgressView {
  /** The stored high-water position. Rises with any drag. */
  resumeAt: number;
  /** Everything actually played, for seeding the player. */
  playedRanges: PlayedRange[];
  /** The stretch from 0:00, for a page still on the previous build. */
  playedUntil: number;
}

/**
 * What the embed routes hand the player about a student's past watching.
 * Falls back to the pre-ledger columns when the migration has not landed, so a
 * resume point is never lost to a missing column.
 */
export async function readWatchProgress(
  supabase: any,
  studentId: string,
  recapId: string,
): Promise<WatchProgressView> {
  const query = (columns: string) =>
    supabase
      .from('nexus_class_recap_progress')
      .select(columns)
      .eq('student_id', studentId)
      .eq('recap_id', recapId)
      .maybeSingle();

  let { data, error } = await query('last_video_position_seconds, watched_seconds, played_ranges');
  if (error && isMissingSchema(error)) {
    ({ data } = await query('last_video_position_seconds, watched_seconds'));
  }

  const stored = readStoredWatch(data ?? null);
  const ranges = storedRanges(stored);
  return {
    resumeAt: stored.position,
    playedRanges: ranges,
    playedUntil: stored.ranges ? prefixEnd(ranges) : creditedPlayedUntil(stored.position, stored.watchedSeconds),
  };
}
