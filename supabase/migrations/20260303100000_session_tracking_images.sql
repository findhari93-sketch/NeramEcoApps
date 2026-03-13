-- Phase 2: Cross-Session Tracking + Image Upload
-- Allows users to report "I got this question too" with their session details
-- Adds image support for question posts and improvements

-- ============================================================
-- 1. Question Sessions table
-- ============================================================
CREATE TABLE IF NOT EXISTS question_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES question_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_year INTEGER NOT NULL,
  exam_date DATE,
  session_label TEXT, -- e.g., "Session 1 - Friday", "Morning Slot"
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Use a functional unique index for COALESCE (can't use functions in UNIQUE constraint)
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_sessions
  ON question_sessions(question_id, user_id, exam_year, COALESCE(session_label, ''));

CREATE INDEX idx_question_sessions_question ON question_sessions(question_id);
CREATE INDEX idx_question_sessions_user ON question_sessions(user_id);

-- ============================================================
-- 2. Add session_count to question_posts
-- ============================================================
ALTER TABLE question_posts
  ADD COLUMN IF NOT EXISTS session_count INTEGER DEFAULT 0;

-- ============================================================
-- 3. Add image_urls to question_posts and question_improvements
-- ============================================================
ALTER TABLE question_posts
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

ALTER TABLE question_improvements
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- ============================================================
-- 4. Trigger: auto-update session_count on question_posts
-- ============================================================
CREATE OR REPLACE FUNCTION update_session_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE question_posts
    SET session_count = (
      SELECT COUNT(DISTINCT (exam_year, COALESCE(session_label, '')))
      FROM question_sessions
      WHERE question_id = NEW.question_id
    )
    WHERE id = NEW.question_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE question_posts
    SET session_count = (
      SELECT COUNT(DISTINCT (exam_year, COALESCE(session_label, '')))
      FROM question_sessions
      WHERE question_id = OLD.question_id
    )
    WHERE id = OLD.question_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_session_count ON question_sessions;
CREATE TRIGGER trg_update_session_count
  AFTER INSERT OR DELETE ON question_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_count();

-- ============================================================
-- 5. Migrate existing exam_year/exam_session from question_posts
--    into question_sessions (the original poster's session)
-- ============================================================
INSERT INTO question_sessions (question_id, user_id, exam_year, session_label)
SELECT qp.id, qp.user_id, qp.exam_year, qp.exam_session
FROM question_posts qp
WHERE qp.exam_year IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update session_count for migrated data
UPDATE question_posts qp
SET session_count = (
  SELECT COUNT(DISTINCT (qs.exam_year, COALESCE(qs.session_label, '')))
  FROM question_sessions qs
  WHERE qs.question_id = qp.id
);

-- ============================================================
-- 6. RLS Policies
-- ============================================================
ALTER TABLE question_sessions ENABLE ROW LEVEL SECURITY;

-- Anyone can read sessions
CREATE POLICY "Anyone can read question sessions"
  ON question_sessions FOR SELECT
  USING (true);

-- Authenticated users can insert their own sessions
CREATE POLICY "Users can add their own sessions"
  ON question_sessions FOR INSERT
  WITH CHECK (auth.uid()::text IN (
    SELECT firebase_uid FROM users WHERE id = user_id
  ));

-- Users can delete their own sessions
CREATE POLICY "Users can delete their own sessions"
  ON question_sessions FOR DELETE
  USING (auth.uid()::text IN (
    SELECT firebase_uid FROM users WHERE id = user_id
  ));
