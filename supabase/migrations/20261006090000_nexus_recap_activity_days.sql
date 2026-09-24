-- ============================================
-- NEXUS RECAP: ONE ROW PER STUDENT PER RECAP PER DAY
--
-- nexus_class_recap_progress keeps one running total per student per recap, so
-- the catch-up screen could say "watched 40%" but never "over three sittings",
-- and could not tell a student who opened a recap once and left from one who
-- works through it a little every day. Teachers asked exactly that question.
--
-- The heartbeat already arrives every ~10 seconds of playback, so the day row
-- is written by the same function in the same statement batch: no new route,
-- no new client code. It only counts from the day this ships; older progress
-- has no day history and the screen says so rather than inventing one.
--
-- The day is the IST calendar day, because that is the day a student and a
-- teacher in India would name.
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_class_recap_activity_days (
  student_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recap_id                  UUID NOT NULL REFERENCES nexus_class_recaps(id) ON DELETE CASCADE,
  day                       DATE NOT NULL,
  watched_seconds           INTEGER NOT NULL DEFAULT 0,
  furthest_position_seconds INTEGER NOT NULL DEFAULT 0,
  first_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, recap_id, day)
);

CREATE INDEX IF NOT EXISTS idx_recap_activity_days_recap
  ON nexus_class_recap_activity_days(recap_id, student_id);

-- Service role only, like the rest of the Nexus surface (MSAL, so auth.uid()
-- is always null and a policy would be dead code).
ALTER TABLE nexus_class_recap_activity_days ENABLE ROW LEVEL SECURITY;

-- Same body as 20260811090100, plus the day row at the end. Same five-argument
-- signature on purpose: a sixth parameter with a default would create an
-- overload that five-argument calls match ambiguously (see 20260820090200).
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
  v_day DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
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

  -- The sitting record. A heartbeat with nothing watched (a pause, a page
  -- leave) still marks the day as touched, which is the honest reading: the
  -- student opened it that day.
  INSERT INTO nexus_class_recap_activity_days (
    student_id, recap_id, day, watched_seconds, furthest_position_seconds
  )
  VALUES (p_student, p_recap, v_day, v_delta, v_pos)
  ON CONFLICT (student_id, recap_id, day) DO UPDATE SET
    watched_seconds = nexus_class_recap_activity_days.watched_seconds + v_delta,
    furthest_position_seconds = GREATEST(
      nexus_class_recap_activity_days.furthest_position_seconds, v_pos
    ),
    last_at = now();

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

-- Both callers use the service-role client. Supabase grants EXECUTE to anon and
-- authenticated directly, so REVOKE FROM PUBLIC alone would leave them in.
REVOKE EXECUTE ON FUNCTION nexus_bump_recap_progress(UUID, UUID, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_bump_recap_progress(UUID, UUID, INTEGER, INTEGER, INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';
