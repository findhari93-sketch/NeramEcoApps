-- ============================================================
-- GAMIFICATION MODULE — Tables, Indexes, RLS, Seed Data
-- ============================================================
-- Adds leaderboard, badges, points, streaks, and activity log
-- for the Nexus student gamification system.
-- ============================================================

-- ============================================
-- 1. BADGE DEFINITIONS (catalog)
-- ============================================
CREATE TABLE IF NOT EXISTS gamification_badge_definitions (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  criteria_description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('attendance', 'checklist', 'growth', 'leaderboard')),
  rarity_tier TEXT NOT NULL CHECK (rarity_tier IN ('common', 'rare', 'epic', 'legendary')),
  icon_svg_path TEXT NOT NULL DEFAULT '',
  icon_locked_svg_path TEXT NOT NULL DEFAULT '',
  points_bonus INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. STUDENT BADGES (earned)
-- ============================================
CREATE TABLE IF NOT EXISTS gamification_student_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES gamification_badge_definitions(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  earned_context JSONB DEFAULT '{}',
  notified BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(student_id, badge_id)
);

CREATE INDEX idx_gam_student_badges_student ON gamification_student_badges(student_id);
CREATE INDEX idx_gam_student_badges_earned ON gamification_student_badges(earned_at DESC);

-- ============================================
-- 3. POINT EVENTS (append-only ledger)
-- ============================================
CREATE TABLE IF NOT EXISTS gamification_point_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL,
  batch_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'class_attended',
    'checklist_item_completed',
    'full_checklist_completed',
    'drawing_submitted',
    'drawing_reviewed',
    'streak_day',
    'streak_milestone',
    'quiz_completed',
    'peer_help',
    'badge_bonus',
    'manual_teacher_award'
  )),
  points INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  source_id TEXT,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, event_type, source_id)
);

CREATE INDEX idx_gam_point_events_student_date ON gamification_point_events(student_id, event_date);
CREATE INDEX idx_gam_point_events_classroom_date ON gamification_point_events(classroom_id, event_date);
CREATE INDEX idx_gam_point_events_batch_date ON gamification_point_events(batch_id, event_date) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_gam_point_events_event_date ON gamification_point_events(event_date);

-- ============================================
-- 4. STUDENT STREAKS
-- ============================================
CREATE TABLE IF NOT EXISTS gamification_student_streaks (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  streak_started_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 5. WEEKLY LEADERBOARD (snapshots)
-- ============================================
CREATE TABLE IF NOT EXISTS gamification_weekly_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL,
  batch_id UUID,
  week_start DATE NOT NULL,
  raw_score INTEGER NOT NULL DEFAULT 0,
  normalized_score NUMERIC(7,2) NOT NULL DEFAULT 0,
  max_possible_score INTEGER NOT NULL DEFAULT 0,
  rank_in_batch INTEGER,
  rank_all_neram INTEGER,
  streak_length INTEGER NOT NULL DEFAULT 0,
  attendance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  rank_change INTEGER NOT NULL DEFAULT 0,
  is_rising_star BOOLEAN NOT NULL DEFAULT false,
  is_comeback_kid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, week_start)
);

CREATE INDEX idx_gam_weekly_lb_batch_week ON gamification_weekly_leaderboard(batch_id, week_start);
CREATE INDEX idx_gam_weekly_lb_classroom_week ON gamification_weekly_leaderboard(classroom_id, week_start);
CREATE INDEX idx_gam_weekly_lb_week_rank ON gamification_weekly_leaderboard(week_start, rank_in_batch);

-- ============================================
-- 6. MONTHLY LEADERBOARD (snapshots)
-- ============================================
CREATE TABLE IF NOT EXISTS gamification_monthly_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL,
  batch_id UUID,
  month_start DATE NOT NULL,
  raw_score INTEGER NOT NULL DEFAULT 0,
  normalized_score NUMERIC(7,2) NOT NULL DEFAULT 0,
  max_possible_score INTEGER NOT NULL DEFAULT 0,
  rank_in_batch INTEGER,
  rank_all_neram INTEGER,
  streak_length INTEGER NOT NULL DEFAULT 0,
  attendance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  rank_change INTEGER NOT NULL DEFAULT 0,
  badges_earned_this_month INTEGER NOT NULL DEFAULT 0,
  is_rising_star BOOLEAN NOT NULL DEFAULT false,
  is_comeback_kid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, month_start)
);

CREATE INDEX idx_gam_monthly_lb_batch_month ON gamification_monthly_leaderboard(batch_id, month_start);
CREATE INDEX idx_gam_monthly_lb_classroom_month ON gamification_monthly_leaderboard(classroom_id, month_start);

-- ============================================
-- 7. STUDENT ACTIVITY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS gamification_student_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'class_attended',
    'checklist_completed',
    'checklist_item_completed',
    'drawing_submitted',
    'drawing_reviewed',
    'badge_earned',
    'streak_milestone',
    'rank_improved',
    'manual_award'
  )),
  title TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  activity_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gam_activity_student_date ON gamification_student_activity_log(student_id, activity_date DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Badge definitions: public read
ALTER TABLE gamification_badge_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read badge definitions"
  ON gamification_badge_definitions FOR SELECT
  USING (true);
CREATE POLICY "Service role manages badge definitions"
  ON gamification_badge_definitions FOR ALL
  USING (auth.role() = 'service_role');

-- Student badges: authenticated read, service role write
ALTER TABLE gamification_student_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read student badges"
  ON gamification_student_badges FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Service role manages student badges"
  ON gamification_student_badges FOR ALL
  USING (auth.role() = 'service_role');

-- Point events: authenticated read, service role write
ALTER TABLE gamification_point_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read point events"
  ON gamification_point_events FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Service role manages point events"
  ON gamification_point_events FOR ALL
  USING (auth.role() = 'service_role');

-- Student streaks: authenticated read, service role write
ALTER TABLE gamification_student_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read streaks"
  ON gamification_student_streaks FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Service role manages streaks"
  ON gamification_student_streaks FOR ALL
  USING (auth.role() = 'service_role');

-- Weekly leaderboard: authenticated read
ALTER TABLE gamification_weekly_leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read weekly leaderboard"
  ON gamification_weekly_leaderboard FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Service role manages weekly leaderboard"
  ON gamification_weekly_leaderboard FOR ALL
  USING (auth.role() = 'service_role');

-- Monthly leaderboard: authenticated read
ALTER TABLE gamification_monthly_leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read monthly leaderboard"
  ON gamification_monthly_leaderboard FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Service role manages monthly leaderboard"
  ON gamification_monthly_leaderboard FOR ALL
  USING (auth.role() = 'service_role');

-- Activity log: authenticated read
ALTER TABLE gamification_student_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read activity log"
  ON gamification_student_activity_log FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Service role manages activity log"
  ON gamification_student_activity_log FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- SEED DATA: 10 Launch Badges
-- ============================================
INSERT INTO gamification_badge_definitions (id, display_name, description, criteria_description, category, rarity_tier, icon_svg_path, icon_locked_svg_path, points_bonus, sort_order) VALUES
  -- Attendance & Consistency
  ('first_step', 'First Step', 'Attended your very first class on Nexus', 'Attend your first class', 'attendance', 'common', '/badges/first-step.svg', '/badges/first-step-locked.svg', 0, 1),
  ('early_bird', 'Early Bird', 'Joined 3 classes before scheduled start time in a week', 'Join 3 classes early in one week', 'attendance', 'common', '/badges/early-bird.svg', '/badges/early-bird-locked.svg', 0, 2),
  ('never_miss', 'Never Miss', '95%+ attendance in a calendar month', 'Achieve 95%+ attendance in a month', 'attendance', 'rare', '/badges/never-miss.svg', '/badges/never-miss-locked.svg', 0, 3),
  ('iron_streak', 'Iron Streak', 'Maintained a 30-day unbroken activity streak', 'Maintain a 30-day streak', 'attendance', 'rare', '/badges/iron-streak.svg', '/badges/iron-streak-locked.svg', 0, 4),
  -- Task & Checklist Completion
  ('task_starter', 'Task Starter', 'Completed your first checklist item', 'Complete your first checklist item', 'checklist', 'common', '/badges/task-starter.svg', '/badges/task-starter-locked.svg', 0, 5),
  ('all_clear', 'All Clear', 'Completed every checklist item in a single week', 'Complete all checklist items in one week', 'checklist', 'common', '/badges/all-clear.svg', '/badges/all-clear-locked.svg', 0, 6),
  ('checklist_champion', 'Checklist Champion', 'Highest task completion rate in your batch for a month', 'Achieve the highest completion rate in your batch', 'checklist', 'rare', '/badges/checklist-champion.svg', '/badges/checklist-champion-locked.svg', 0, 7),
  -- Growth & Improvement
  ('rising_star', 'Rising Star', 'Improved rank by 10+ positions in one week', 'Improve your rank by 10+ positions in a week', 'growth', 'common', '/badges/rising-star.svg', '/badges/rising-star-locked.svg', 0, 8),
  ('comeback_kid', 'Comeback Kid', 'Went from below 60% to above 85% attendance in consecutive weeks', 'Improve attendance from <60% to >85%', 'growth', 'rare', '/badges/comeback-kid.svg', '/badges/comeback-kid-locked.svg', 0, 9),
  -- Leaderboard & Competition
  ('on_the_board', 'On the Board', 'Appeared in top 15 of weekly leaderboard for the first time', 'Reach the top 15 in weekly leaderboard', 'leaderboard', 'common', '/badges/on-the-board.svg', '/badges/on-the-board-locked.svg', 0, 10)
ON CONFLICT (id) DO NOTHING;
