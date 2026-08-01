-- Attempt accounting for the automatic recording-link lookup.
--
-- Until now nothing filled nexus_scheduled_classes.recording_url on a schedule:
-- it was written only when a human pressed Sync, Generate or Backfill. That one
-- gap stalled the whole video chain, because syncClassYouTubeBackups selects on
-- `recording_url IS NOT NULL`, so a class nobody touched was never backed up and
-- Teams deleted its recording after about six months.
--
-- Two scalars on the class row rather than a child table, matching the shape
-- attendance already uses (attendance_sync_attempts / attendance_synced_at).
-- The alternative, a nexus_class_recordings child table, would buy nothing: there
-- is exactly one recording link per class and the timetable already selects this
-- row.
--
-- The cap is what stops a class Teams never published a recording for from being
-- retried twice a night forever. Same reasoning as nexus_class_transcripts.

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS recording_sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recording_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS recording_sync_detail TEXT;

COMMENT ON COLUMN nexus_scheduled_classes.recording_sync_attempts IS
  'Automatic recording lookups spent on this class. Only the cron increments it; an interactive Generate or Sync must not, or a few impatient presses would retire the class from the sweep.';
COMMENT ON COLUMN nexus_scheduled_classes.recording_sync_status IS
  'NULL = never tried, pending = tried and not found yet, unavailable = attempt cap reached, terminal.';
COMMENT ON COLUMN nexus_scheduled_classes.recording_sync_detail IS
  'Why the last automatic lookup came up empty. Diagnostic only.';

-- The sweep''s candidate query: published, uncancelled, no link yet, not retired.
-- Partial so it stays small, since the overwhelming majority of rows have either
-- a recording or a settled status.
CREATE INDEX IF NOT EXISTS idx_scheduled_classes_recording_due
  ON nexus_scheduled_classes (scheduled_date DESC)
  WHERE recording_url IS NULL
    AND (recording_sync_status IS NULL OR recording_sync_status <> 'unavailable');
