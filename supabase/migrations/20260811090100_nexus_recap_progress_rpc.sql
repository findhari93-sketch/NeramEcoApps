-- ============================================
-- NEXUS RECAP: MONOTONIC PROGRESS HEARTBEAT
--
-- One atomic upsert for the watch heartbeat, replacing a read-modify-write from
-- the API route. Three things it gets right that the plain upsert did not:
--
--   1. Positions only ever move forward (GREATEST). The old path wrote the
--      client's number as-is, so a student scrubbing backwards to re-hear
--      something lowered their stored resume point, and a late-arriving flush
--      could overwrite a newer one.
--   2. watched_seconds accumulates rather than being replaced, and each bump is
--      capped, so a forged or replayed beacon cannot inflate it into a pass.
--   3. video_duration_seconds is backfilled from the player when the recap has
--      none. That NULL is why rearmCatchupTest currently skips its "watched at
--      least 90%" gate entirely: it has nothing to take 90% of.
-- ============================================

-- A legitimate bump is about 10 seconds: the client flushes on a 10s interval
-- and clears its accumulator optimistically, so a failed flush drops its delta
-- rather than compounding it. 60 is generous headroom for a slow tick while
-- still bounding what a hand-crafted request can claim in one call.
CREATE OR REPLACE FUNCTION nexus_bump_recap_progress(
  p_student UUID,
  p_recap UUID,
  p_pos INTEGER,
  p_watched_delta INTEGER DEFAULT 0,
  p_duration INTEGER DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_pos INTEGER := GREATEST(COALESCE(p_pos, 0), 0);
  v_delta INTEGER := LEAST(GREATEST(COALESCE(p_watched_delta, 0), 0), 60);
BEGIN
  INSERT INTO nexus_class_recap_progress (
    student_id, recap_id, status, started_at,
    last_video_position_seconds, furthest_position_seconds,
    watched_seconds, last_heartbeat_at
  )
  VALUES (
    p_student, p_recap, 'in_progress', now(),
    v_pos, v_pos, v_delta, now()
  )
  ON CONFLICT (student_id, recap_id) DO UPDATE SET
    last_video_position_seconds = GREATEST(
      nexus_class_recap_progress.last_video_position_seconds, v_pos
    ),
    furthest_position_seconds = GREATEST(
      nexus_class_recap_progress.furthest_position_seconds, v_pos
    ),
    watched_seconds = nexus_class_recap_progress.watched_seconds + v_delta,
    last_heartbeat_at = now(),
    -- A completed recap stays completed; a heartbeat during revision must not
    -- knock it back to in_progress and re-lock the catch-up step behind it.
    status = CASE
      WHEN nexus_class_recap_progress.status = 'completed' THEN 'completed'
      ELSE 'in_progress'
    END,
    started_at = COALESCE(nexus_class_recap_progress.started_at, now());

  -- Only fills a gap, never corrects an existing value: the recap's own figure
  -- comes from the class record and is authoritative where it exists.
  IF p_duration IS NOT NULL AND p_duration > 0 THEN
    UPDATE nexus_class_recaps
    SET video_duration_seconds = p_duration
    WHERE id = p_recap
      AND (video_duration_seconds IS NULL OR video_duration_seconds <= 0);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION nexus_bump_recap_progress(UUID, UUID, INTEGER, INTEGER, INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';
