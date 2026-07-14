-- Silent study tracking: dwell time + completion state per (student, file).
--
-- Extends the existing nexus_study_file_reads row (one per student+file) so we can derive a status:
--   no row            -> not_opened
--   row, no completed -> studying   (active_seconds = idle-aware time spent reading)
--   completed_at set  -> completed  (set in Phase 4 when the linked test is passed)
--
-- The heartbeat RPC increments active_seconds atomically so concurrent flushes never clobber it.

ALTER TABLE nexus_study_file_reads
  ADD COLUMN IF NOT EXISTS active_seconds   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS best_score_pct   NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS best_attempt_id  UUID;

-- Create the (student, file) row on first open, else add to active_seconds. Non-negative guard.
CREATE OR REPLACE FUNCTION nexus_study_record_heartbeat(p_user_id uuid, p_file_id uuid, p_add int)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO nexus_study_file_reads (user_id, file_id, opened_at, active_seconds, last_activity_at)
  VALUES (p_user_id, p_file_id, now(), GREATEST(COALESCE(p_add, 0), 0), now())
  ON CONFLICT (user_id, file_id) DO UPDATE
    SET active_seconds   = nexus_study_file_reads.active_seconds + GREATEST(COALESCE(p_add, 0), 0),
        last_activity_at = now();
$$;
