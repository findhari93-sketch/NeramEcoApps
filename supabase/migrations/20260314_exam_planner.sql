-- =============================================================
-- NATA 2026 Exam Planner: Session Preferences + Rewards
-- =============================================================

-- 1. User exam session preferences (planner data)
CREATE TABLE IF NOT EXISTS user_exam_session_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_schedule_id UUID,
  phase TEXT NOT NULL,
  exam_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  session_label TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, exam_date, time_slot),
  CHECK (phase IN ('phase_1', 'phase_2')),
  CHECK (time_slot IN ('morning', 'afternoon'))
);

CREATE INDEX IF NOT EXISTS idx_exam_pref_user ON user_exam_session_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_pref_schedule ON user_exam_session_preferences(exam_schedule_id);
CREATE INDEX IF NOT EXISTS idx_exam_pref_date ON user_exam_session_preferences(exam_date);

-- RLS for user_exam_session_preferences
ALTER TABLE user_exam_session_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON user_exam_session_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences"
  ON user_exam_session_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own preferences"
  ON user_exam_session_preferences FOR DELETE
  USING (user_id = auth.uid());

-- Service role bypasses RLS automatically

-- 2. User rewards (generic engagement rewards)
CREATE TABLE IF NOT EXISTS user_rewards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_user_rewards_user ON user_rewards(user_id);

-- RLS for user_rewards
ALTER TABLE user_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own rewards"
  ON user_rewards FOR SELECT
  USING (user_id = auth.uid());

-- Service role manages inserts (rewards are granted server-side)
