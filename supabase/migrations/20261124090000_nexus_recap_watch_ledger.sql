-- Watch ledger: what a student actually played of a recap, kept on the server.
--
-- Until now the stretches a student had played lived only in the page, and the
-- heartbeat sent deltas it forgot on send. A failed request lost playback for
-- good, and a reload rebuilt coverage from one number those losses had shrunk,
-- so students on weak connections were sent back to rewatch sections they had
-- watched (recap 68f14d40, 2026-10-12: 86 minutes on a 14 minute section).
--
-- The heartbeat now reports cumulative per-session totals, so a resend changes
-- nothing (apps/nexus/src/lib/watch-ledger.ts). These columns hold the merged
-- played ranges and a small per-session baseline; watch_version guards the
-- read-modify-write in the route against two flushes landing together.
--
-- Foundation chapter tracks share nexus_class_recap_progress (recap_id is the
-- track id), so they get the same ledger through the same function.

ALTER TABLE nexus_class_recap_progress
  ADD COLUMN IF NOT EXISTS played_ranges JSONB,
  ADD COLUMN IF NOT EXISTS watch_sessions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS watch_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN nexus_class_recap_progress.played_ranges IS
  'Merged [start, end] seconds actually played. NULL on rows written before the ledger; read as [[0, min(position, watched + 60)]].';

-- Per day playback health, so the next "it keeps buffering" report can be
-- answered from data instead of guessed at.
ALTER TABLE nexus_class_recap_activity_days
  ADD COLUMN IF NOT EXISTS stall_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stall_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stream_reloads INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grant_refreshes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grant_refresh_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discarded_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_seeks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- A new name rather than another overload of nexus_bump_recap_progress: an
-- overload with defaults is matched ambiguously by five-argument calls (see
-- 20260820090200). Returns false when another write got there first, and the
-- caller re-reads and tries again.
CREATE OR REPLACE FUNCTION nexus_apply_recap_watch(
  p_student UUID,
  p_recap UUID,
  p_expected_version INTEGER,
  p_pos INTEGER,
  p_credit INTEGER,
  p_ranges JSONB,
  p_sessions JSONB,
  p_blocked INTEGER,
  p_duration INTEGER,
  p_diag JSONB,
  p_user_agent TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pos INTEGER := GREATEST(COALESCE(p_pos, 0), 0);
  v_credit INTEGER := GREATEST(COALESCE(p_credit, 0), 0);
  v_blocked INTEGER := LEAST(GREATEST(COALESCE(p_blocked, 0), 0), 50);
  v_day DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_rows INTEGER;
BEGIN
  INSERT INTO nexus_class_recap_progress AS p (
    student_id, recap_id, status, started_at,
    last_video_position_seconds, furthest_position_seconds,
    watched_seconds, blocked_seeks, last_heartbeat_at,
    played_ranges, watch_sessions, watch_version
  )
  VALUES (
    p_student, p_recap, 'in_progress', now(),
    v_pos, v_pos, v_credit, v_blocked, now(),
    p_ranges, COALESCE(p_sessions, '{}'::jsonb), 1
  )
  ON CONFLICT (student_id, recap_id) DO UPDATE SET
    last_video_position_seconds = GREATEST(p.last_video_position_seconds, v_pos),
    furthest_position_seconds = GREATEST(p.furthest_position_seconds, v_pos),
    watched_seconds = p.watched_seconds + v_credit,
    blocked_seeks = COALESCE(p.blocked_seeks, 0) + v_blocked,
    last_heartbeat_at = now(),
    played_ranges = p_ranges,
    watch_sessions = COALESCE(p_sessions, '{}'::jsonb),
    watch_version = p.watch_version + 1,
    -- A completed recap stays completed; a heartbeat during revision must not
    -- knock it back to in_progress and re-lock the catch-up step behind it.
    status = CASE WHEN p.status = 'completed' THEN 'completed' ELSE 'in_progress' END,
    started_at = COALESCE(p.started_at, now())
  WHERE p.watch_version = p_expected_version;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO nexus_class_recap_activity_days AS d (
    student_id, recap_id, day, watched_seconds, furthest_position_seconds,
    stall_count, stall_seconds, stream_reloads, grant_refreshes,
    grant_refresh_failures, discarded_seconds, blocked_seeks, user_agent
  )
  VALUES (
    p_student, p_recap, v_day, v_credit, v_pos,
    COALESCE((p_diag->>'stalls')::int, 0),
    COALESCE((p_diag->>'stall_seconds')::int, 0),
    COALESCE((p_diag->>'reloads')::int, 0),
    COALESCE((p_diag->>'grant_refreshes')::int, 0),
    COALESCE((p_diag->>'grant_refresh_failures')::int, 0),
    COALESCE((p_diag->>'discarded_seconds')::int, 0),
    v_blocked,
    p_user_agent
  )
  ON CONFLICT (student_id, recap_id, day) DO UPDATE SET
    watched_seconds = d.watched_seconds + v_credit,
    furthest_position_seconds = GREATEST(d.furthest_position_seconds, v_pos),
    stall_count = d.stall_count + COALESCE((p_diag->>'stalls')::int, 0),
    stall_seconds = d.stall_seconds + COALESCE((p_diag->>'stall_seconds')::int, 0),
    stream_reloads = d.stream_reloads + COALESCE((p_diag->>'reloads')::int, 0),
    grant_refreshes = d.grant_refreshes + COALESCE((p_diag->>'grant_refreshes')::int, 0),
    grant_refresh_failures = d.grant_refresh_failures + COALESCE((p_diag->>'grant_refresh_failures')::int, 0),
    discarded_seconds = d.discarded_seconds + COALESCE((p_diag->>'discarded_seconds')::int, 0),
    blocked_seeks = d.blocked_seeks + v_blocked,
    user_agent = COALESCE(p_user_agent, d.user_agent),
    last_at = now();

  -- Only fills a gap, never corrects an existing value.
  IF p_duration IS NOT NULL AND p_duration > 0 THEN
    UPDATE nexus_class_recaps
    SET video_duration_seconds = p_duration
    WHERE id = p_recap
      AND (video_duration_seconds IS NULL OR video_duration_seconds <= 0);
  END IF;

  RETURN TRUE;
END;
$$;

-- Service role only. Supabase grants EXECUTE to anon and authenticated
-- directly, so REVOKE FROM PUBLIC alone would leave them in.
REVOKE EXECUTE ON FUNCTION nexus_apply_recap_watch(UUID, UUID, INTEGER, INTEGER, INTEGER, JSONB, JSONB, INTEGER, INTEGER, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_apply_recap_watch(UUID, UUID, INTEGER, INTEGER, INTEGER, JSONB, JSONB, INTEGER, INTEGER, JSONB, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
