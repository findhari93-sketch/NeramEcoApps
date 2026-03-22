-- ============================================================
-- VIDEO LIBRARY - Engagement Tracking Tables
-- Session-level watch tracking + nightly rollup aggregates
-- ============================================================

-- Watch sessions: one row per viewing session
CREATE TABLE library_watch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES library_videos(id) ON DELETE CASCADE,

  -- Session timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,

  -- Watch behavior signals
  watched_seconds INTEGER DEFAULT 0,
  furthest_position_seconds INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 1,
  pause_count INTEGER DEFAULT 0,
  seek_count INTEGER DEFAULT 0,
  rewind_count INTEGER DEFAULT 0,
  replay_segments JSONB DEFAULT '[]',

  -- Completion
  completion_pct NUMERIC(5,2) DEFAULT 0,
  completed BOOLEAN DEFAULT false,

  -- Context
  device_type TEXT CHECK (device_type IN ('mobile', 'tablet', 'desktop')),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_watch_sessions_student ON library_watch_sessions(student_id);
CREATE INDEX idx_watch_sessions_video ON library_watch_sessions(video_id);
CREATE INDEX idx_watch_sessions_started ON library_watch_sessions(started_at);
CREATE INDEX idx_watch_sessions_student_started ON library_watch_sessions(student_id, started_at);


-- Daily engagement aggregates (populated by nightly rollup)
CREATE TABLE library_engagement_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,

  -- Daily aggregates
  videos_watched INTEGER DEFAULT 0,
  videos_completed INTEGER DEFAULT 0,
  unique_videos INTEGER DEFAULT 0,
  total_watch_seconds INTEGER DEFAULT 0,
  total_session_seconds INTEGER DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,

  -- Behavior signals
  total_seeks INTEGER DEFAULT 0,
  total_rewinds INTEGER DEFAULT 0,
  total_pauses INTEGER DEFAULT 0,
  bookmarks_created INTEGER DEFAULT 0,
  search_queries INTEGER DEFAULT 0,

  -- Computed
  avg_completion_pct NUMERIC(5,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, activity_date)
);

CREATE INDEX idx_engagement_daily_student ON library_engagement_daily(student_id);
CREATE INDEX idx_engagement_daily_date ON library_engagement_daily(activity_date);
CREATE INDEX idx_engagement_daily_student_date ON library_engagement_daily(student_id, activity_date);


-- Student streaks and engagement status (updated by nightly rollup)
CREATE TABLE library_student_streaks (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Current streak
  current_streak_days INTEGER DEFAULT 0,
  current_streak_start DATE,

  -- Best streak
  best_streak_days INTEGER DEFAULT 0,
  best_streak_start DATE,
  best_streak_end DATE,

  -- Weekly streak
  current_weekly_streak INTEGER DEFAULT 0,
  best_weekly_streak INTEGER DEFAULT 0,

  -- Lifetime stats
  total_active_days INTEGER DEFAULT 0,
  total_active_weeks INTEGER DEFAULT 0,
  first_activity_date DATE,
  last_activity_date DATE,

  -- Engagement classification
  engagement_status TEXT DEFAULT 'new'
    CHECK (engagement_status IN ('active', 'moderate', 'inactive', 'new')),
  engagement_score NUMERIC(5,2) DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT now()
);


-- Search log (lightweight query tracking)
CREATE TABLE library_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_video_id UUID REFERENCES library_videos(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_search_log_student ON library_search_log(student_id);
CREATE INDEX idx_search_log_created ON library_search_log(created_at);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- library_watch_sessions
ALTER TABLE library_watch_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_watch_sessions"
  ON library_watch_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "students_own_watch_sessions"
  ON library_watch_sessions FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "teachers_read_watch_sessions"
  ON library_watch_sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- library_engagement_daily
ALTER TABLE library_engagement_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_engagement_daily"
  ON library_engagement_daily FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "students_own_engagement_daily"
  ON library_engagement_daily FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "teachers_read_engagement_daily"
  ON library_engagement_daily FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- library_student_streaks
ALTER TABLE library_student_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_student_streaks"
  ON library_student_streaks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "students_own_streaks"
  ON library_student_streaks FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "teachers_read_streaks"
  ON library_student_streaks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- library_search_log
ALTER TABLE library_search_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_search_log"
  ON library_search_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "students_insert_own_search_log"
  ON library_search_log FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "teachers_read_search_log"
  ON library_search_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );


-- ============================================================
-- ROLLUP FUNCTIONS
-- ============================================================

-- Nightly rollup: aggregate watch sessions into daily engagement
CREATE OR REPLACE FUNCTION rollup_library_engagement(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
BEGIN
  -- Roll up watch sessions into daily engagement
  INSERT INTO library_engagement_daily (
    student_id, activity_date, videos_watched, videos_completed,
    unique_videos, total_watch_seconds, total_session_seconds,
    sessions_count, total_seeks, total_rewinds, total_pauses,
    avg_completion_pct
  )
  SELECT
    s.student_id,
    target_date,
    COUNT(*),
    COUNT(*) FILTER (WHERE s.completed),
    COUNT(DISTINCT s.video_id),
    COALESCE(SUM(s.watched_seconds), 0),
    COALESCE(SUM(s.duration_seconds), 0),
    COUNT(*),
    COALESCE(SUM(s.seek_count), 0),
    COALESCE(SUM(s.rewind_count), 0),
    COALESCE(SUM(s.pause_count), 0),
    COALESCE(AVG(s.completion_pct), 0)
  FROM library_watch_sessions s
  WHERE s.started_at::date = target_date
  GROUP BY s.student_id
  ON CONFLICT (student_id, activity_date) DO UPDATE SET
    videos_watched = EXCLUDED.videos_watched,
    videos_completed = EXCLUDED.videos_completed,
    unique_videos = EXCLUDED.unique_videos,
    total_watch_seconds = EXCLUDED.total_watch_seconds,
    total_session_seconds = EXCLUDED.total_session_seconds,
    sessions_count = EXCLUDED.sessions_count,
    total_seeks = EXCLUDED.total_seeks,
    total_rewinds = EXCLUDED.total_rewinds,
    total_pauses = EXCLUDED.total_pauses,
    avg_completion_pct = EXCLUDED.avg_completion_pct;

  -- Roll up bookmark counts for the day
  UPDATE library_engagement_daily d SET
    bookmarks_created = sub.cnt
  FROM (
    SELECT b.student_id, COUNT(*) AS cnt
    FROM library_bookmarks b
    WHERE b.created_at::date = target_date
    GROUP BY b.student_id
  ) sub
  WHERE d.student_id = sub.student_id
    AND d.activity_date = target_date;

  -- Roll up search query counts for the day
  UPDATE library_engagement_daily d SET
    search_queries = sub.cnt
  FROM (
    SELECT sl.student_id, COUNT(*) AS cnt
    FROM library_search_log sl
    WHERE sl.created_at::date = target_date
    GROUP BY sl.student_id
  ) sub
  WHERE d.student_id = sub.student_id
    AND d.activity_date = target_date;

  -- Update streaks for all active students
  PERFORM update_library_streaks();
END;
$$ LANGUAGE plpgsql;


-- Update streaks for all students with recent activity
CREATE OR REPLACE FUNCTION update_library_streaks()
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT student_id FROM library_engagement_daily
    WHERE activity_date >= CURRENT_DATE - 90
  LOOP
    PERFORM update_student_library_streak(r.student_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- Update streak for a single student
CREATE OR REPLACE FUNCTION update_student_library_streak(p_student_id UUID)
RETURNS void AS $$
DECLARE
  v_current_streak INTEGER := 0;
  v_current_streak_start DATE;
  v_best_streak INTEGER := 0;
  v_best_streak_start DATE;
  v_best_streak_end DATE;
  v_total_active_days INTEGER;
  v_last_activity DATE;
  v_first_activity DATE;
  v_engagement_status TEXT;
  v_engagement_score NUMERIC(5,2);
  v_total_videos INTEGER;
  v_student_videos INTEGER;
  v_student_hours NUMERIC;
  v_max_hours NUMERIC;
  v_avg_completion NUMERIC;
  rec RECORD;
BEGIN
  -- Get total active days and date range
  SELECT
    COUNT(DISTINCT activity_date),
    MIN(activity_date),
    MAX(activity_date)
  INTO v_total_active_days, v_first_activity, v_last_activity
  FROM library_engagement_daily
  WHERE student_id = p_student_id AND videos_watched > 0;

  -- If no activity, set as new/inactive
  IF v_total_active_days IS NULL OR v_total_active_days = 0 THEN
    INSERT INTO library_student_streaks (student_id, engagement_status, updated_at)
    VALUES (p_student_id, 'new', now())
    ON CONFLICT (student_id) DO UPDATE SET
      current_streak_days = 0,
      engagement_status = 'new',
      engagement_score = 0,
      updated_at = now();
    RETURN;
  END IF;

  -- Calculate streaks using gaps
  FOR rec IN
    WITH daily_activity AS (
      SELECT DISTINCT activity_date AS d
      FROM library_engagement_daily
      WHERE student_id = p_student_id AND videos_watched > 0
      ORDER BY activity_date
    ),
    with_gaps AS (
      SELECT d,
        d - (ROW_NUMBER() OVER (ORDER BY d))::integer AS grp
      FROM daily_activity
    ),
    streaks AS (
      SELECT
        MIN(d) AS streak_start,
        MAX(d) AS streak_end,
        (MAX(d) - MIN(d) + 1) AS streak_len
      FROM with_gaps
      GROUP BY grp
      ORDER BY streak_len DESC
    )
    SELECT * FROM streaks
  LOOP
    -- Best streak
    IF rec.streak_len > v_best_streak THEN
      v_best_streak := rec.streak_len;
      v_best_streak_start := rec.streak_start;
      v_best_streak_end := rec.streak_end;
    END IF;

    -- Current streak (includes today or yesterday)
    IF rec.streak_end >= CURRENT_DATE - 1 AND v_current_streak = 0 THEN
      v_current_streak := rec.streak_len;
      v_current_streak_start := rec.streak_start;
    END IF;
  END LOOP;

  -- Engagement status
  IF v_last_activity >= CURRENT_DATE - 3 THEN
    v_engagement_status := 'active';
  ELSIF v_last_activity >= CURRENT_DATE - 7 THEN
    v_engagement_status := 'moderate';
  ELSE
    v_engagement_status := 'inactive';
  END IF;

  -- Engagement score (0-100)
  SELECT COUNT(*) INTO v_total_videos FROM library_videos WHERE is_published = true;
  SELECT COUNT(DISTINCT video_id) INTO v_student_videos
    FROM library_watch_history WHERE student_id = p_student_id;
  SELECT COALESCE(SUM(total_watch_seconds) / 3600.0, 0) INTO v_student_hours
    FROM library_engagement_daily WHERE student_id = p_student_id;
  SELECT COALESCE(MAX(total_hours), 1) INTO v_max_hours
    FROM (SELECT SUM(total_watch_seconds) / 3600.0 AS total_hours
          FROM library_engagement_daily GROUP BY student_id) sub;
  SELECT COALESCE(AVG(avg_completion_pct), 0) INTO v_avg_completion
    FROM library_engagement_daily WHERE student_id = p_student_id AND videos_watched > 0;

  v_engagement_score := (
    0.30 * LEAST(v_student_hours / GREATEST(v_max_hours, 1), 1) +
    0.25 * (v_avg_completion / 100.0) +
    0.20 * LEAST(v_student_videos::numeric / GREATEST(v_total_videos, 1), 1) +
    0.15 * LEAST(v_current_streak / 14.0, 1) +
    0.10 * GREATEST(1.0 - (CURRENT_DATE - v_last_activity) * 0.1, 0)
  ) * 100;

  -- Upsert streak record
  INSERT INTO library_student_streaks (
    student_id,
    current_streak_days, current_streak_start,
    best_streak_days, best_streak_start, best_streak_end,
    total_active_days, first_activity_date, last_activity_date,
    engagement_status, engagement_score,
    updated_at
  ) VALUES (
    p_student_id,
    v_current_streak, v_current_streak_start,
    v_best_streak, v_best_streak_start, v_best_streak_end,
    v_total_active_days, v_first_activity, v_last_activity,
    v_engagement_status, v_engagement_score,
    now()
  )
  ON CONFLICT (student_id) DO UPDATE SET
    current_streak_days = EXCLUDED.current_streak_days,
    current_streak_start = EXCLUDED.current_streak_start,
    best_streak_days = EXCLUDED.best_streak_days,
    best_streak_start = EXCLUDED.best_streak_start,
    best_streak_end = EXCLUDED.best_streak_end,
    total_active_days = EXCLUDED.total_active_days,
    first_activity_date = EXCLUDED.first_activity_date,
    last_activity_date = EXCLUDED.last_activity_date,
    engagement_status = EXCLUDED.engagement_status,
    engagement_score = EXCLUDED.engagement_score,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;
