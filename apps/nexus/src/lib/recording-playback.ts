/**
 * Which file a class's recording plays from.
 *
 * nexus_scheduled_classes.recording_url is always the Teams original, so the
 * many flows that write it (sync, backfill, a teacher re-linking) never have to
 * know about trims. When a trim is applied, students play the trimmed copy
 * instead (lib/recording-trim.ts). Every reader that plays or uploads the
 * recording goes through this one rule.
 */
export interface ClassRecordingRow {
  recording_url?: string | null;
  recording_trimmed_url?: string | null;
  recording_trim_state?: string | null;
}

export function playbackRecordingUrl(row: ClassRecordingRow | null | undefined): string | null {
  if (!row) return null;
  if (row.recording_trim_state === 'applied' && row.recording_trimmed_url) return row.recording_trimmed_url;
  return row.recording_url ?? null;
}
