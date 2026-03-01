-- Phase 4: Contribution Tracking + Access Control
-- Tracks user contributions for progressive unlock system.

-- ============================================================
-- 1. User QB Stats table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_qb_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  questions_posted INTEGER DEFAULT 0,
  improvements_posted INTEGER DEFAULT 0,
  sessions_reported INTEGER DEFAULT 0,
  comments_posted INTEGER DEFAULT 0,
  questions_viewed INTEGER DEFAULT 0,
  -- Computed contribution score: questions*5 + improvements*3 + sessions*2 + comments*1
  contribution_score INTEGER GENERATED ALWAYS AS (
    questions_posted * 5 + improvements_posted * 3 + sessions_reported * 2 + comments_posted * 1
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_qb_stats_user ON user_qb_stats(user_id);
CREATE INDEX idx_user_qb_stats_score ON user_qb_stats(contribution_score DESC);

-- ============================================================
-- 2. Triggers to auto-update stats
-- ============================================================

-- Helper: ensure stats row exists
CREATE OR REPLACE FUNCTION ensure_qb_stats(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_qb_stats (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- questions_posted
CREATE OR REPLACE FUNCTION update_qb_stats_questions()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
    PERFORM ensure_qb_stats(NEW.user_id);
    UPDATE user_qb_stats SET questions_posted = questions_posted + 1, updated_at = now()
    WHERE user_id = NEW.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
      PERFORM ensure_qb_stats(NEW.user_id);
      UPDATE user_qb_stats SET questions_posted = questions_posted + 1, updated_at = now()
      WHERE user_id = NEW.user_id;
    ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE user_qb_stats SET questions_posted = GREATEST(questions_posted - 1, 0), updated_at = now()
      WHERE user_id = NEW.user_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
    UPDATE user_qb_stats SET questions_posted = GREATEST(questions_posted - 1, 0), updated_at = now()
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_qb_stats_questions ON question_posts;
CREATE TRIGGER trg_qb_stats_questions
  AFTER INSERT OR UPDATE OR DELETE ON question_posts
  FOR EACH ROW EXECUTE FUNCTION update_qb_stats_questions();

-- improvements_posted
CREATE OR REPLACE FUNCTION update_qb_stats_improvements()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM ensure_qb_stats(NEW.user_id);
    UPDATE user_qb_stats SET improvements_posted = improvements_posted + 1, updated_at = now()
    WHERE user_id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_qb_stats SET improvements_posted = GREATEST(improvements_posted - 1, 0), updated_at = now()
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_qb_stats_improvements ON question_improvements;
CREATE TRIGGER trg_qb_stats_improvements
  AFTER INSERT OR DELETE ON question_improvements
  FOR EACH ROW EXECUTE FUNCTION update_qb_stats_improvements();

-- sessions_reported
CREATE OR REPLACE FUNCTION update_qb_stats_sessions()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM ensure_qb_stats(NEW.user_id);
    UPDATE user_qb_stats SET sessions_reported = sessions_reported + 1, updated_at = now()
    WHERE user_id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_qb_stats SET sessions_reported = GREATEST(sessions_reported - 1, 0), updated_at = now()
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_qb_stats_sessions ON question_sessions;
CREATE TRIGGER trg_qb_stats_sessions
  AFTER INSERT OR DELETE ON question_sessions
  FOR EACH ROW EXECUTE FUNCTION update_qb_stats_sessions();

-- comments_posted
CREATE OR REPLACE FUNCTION update_qb_stats_comments()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM ensure_qb_stats(NEW.user_id);
    UPDATE user_qb_stats SET comments_posted = comments_posted + 1, updated_at = now()
    WHERE user_id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_qb_stats SET comments_posted = GREATEST(comments_posted - 1, 0), updated_at = now()
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_qb_stats_comments ON question_comments;
CREATE TRIGGER trg_qb_stats_comments
  AFTER INSERT OR DELETE ON question_comments
  FOR EACH ROW EXECUTE FUNCTION update_qb_stats_comments();

-- ============================================================
-- 3. Backfill existing contribution stats
-- ============================================================
INSERT INTO user_qb_stats (user_id, questions_posted, improvements_posted, sessions_reported, comments_posted)
SELECT
  u.id,
  COALESCE((SELECT COUNT(*) FROM question_posts qp WHERE qp.user_id = u.id AND qp.status = 'approved'), 0),
  COALESCE((SELECT COUNT(*) FROM question_improvements qi WHERE qi.user_id = u.id), 0),
  COALESCE((SELECT COUNT(*) FROM question_sessions qs WHERE qs.user_id = u.id), 0),
  COALESCE((SELECT COUNT(*) FROM question_comments qc WHERE qc.user_id = u.id), 0)
FROM users u
WHERE EXISTS (SELECT 1 FROM question_posts WHERE user_id = u.id)
   OR EXISTS (SELECT 1 FROM question_comments WHERE user_id = u.id)
   OR EXISTS (SELECT 1 FROM question_sessions WHERE user_id = u.id)
ON CONFLICT (user_id) DO UPDATE SET
  questions_posted = EXCLUDED.questions_posted,
  improvements_posted = EXCLUDED.improvements_posted,
  sessions_reported = EXCLUDED.sessions_reported,
  comments_posted = EXCLUDED.comments_posted,
  updated_at = now();

-- ============================================================
-- 4. RLS Policies
-- ============================================================
ALTER TABLE user_qb_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own stats"
  ON user_qb_stats FOR SELECT
  USING (auth.uid()::text IN (
    SELECT firebase_uid FROM users WHERE id = user_id
  ));

CREATE POLICY "Admins can read all stats"
  ON user_qb_stats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE firebase_uid = auth.uid()::text
      AND user_type = 'admin'
    )
  );
