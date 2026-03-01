-- ============================================
-- Question Bank v2: Forum Transformation
-- Votes (up/down), Improvements, Confidence, Admin Badge
-- ============================================

-- 1. Create vote_type enum
CREATE TYPE vote_type AS ENUM ('up', 'down');

-- ============================================
-- 2. ALTER question_posts: new columns
-- ============================================

-- Rename like_count to vote_score
ALTER TABLE question_posts RENAME COLUMN like_count TO vote_score;

-- Add upvote/downvote breakdown
ALTER TABLE question_posts
  ADD COLUMN upvote_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN downvote_count INTEGER NOT NULL DEFAULT 0;

-- Confidence level: 1="I may be wrong", 3="Somewhat confident", 5="Very sure"
ALTER TABLE question_posts
  ADD COLUMN confidence_level SMALLINT NOT NULL DEFAULT 3
    CHECK (confidence_level BETWEEN 1 AND 5);

-- Admin post flag (auto-approved, shows "Official" badge)
ALTER TABLE question_posts
  ADD COLUMN is_admin_post BOOLEAN NOT NULL DEFAULT false;

-- Improvement count (denormalized)
ALTER TABLE question_posts
  ADD COLUMN improvement_count INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- 3. ALTER question_comments: rename like_count
-- ============================================

ALTER TABLE question_comments RENAME COLUMN like_count TO vote_score;

-- ============================================
-- 4. QUESTION VOTES TABLE (replaces question_likes)
-- ============================================

CREATE TABLE question_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote vote_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(question_id, user_id)
);

-- ============================================
-- 5. QUESTION IMPROVEMENTS TABLE
-- ============================================

CREATE TABLE question_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  vote_score INTEGER NOT NULL DEFAULT 0,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  downvote_count INTEGER NOT NULL DEFAULT 0,
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  status question_post_status NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 6. IMPROVEMENT VOTES TABLE
-- ============================================

CREATE TABLE improvement_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id UUID NOT NULL REFERENCES question_improvements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote vote_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(improvement_id, user_id)
);

-- ============================================
-- 7. COMMENT VOTES TABLE (replaces comment_likes)
-- ============================================

CREATE TABLE comment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES question_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote vote_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_question_votes_question ON question_votes(question_id);
CREATE INDEX idx_question_votes_user ON question_votes(user_id);

CREATE INDEX idx_improvements_question ON question_improvements(question_id, vote_score DESC);
CREATE INDEX idx_improvements_user ON question_improvements(user_id);
CREATE INDEX idx_improvements_status ON question_improvements(status);

CREATE INDEX idx_improvement_votes_improvement ON improvement_votes(improvement_id);
CREATE INDEX idx_improvement_votes_user ON improvement_votes(user_id);

CREATE INDEX idx_comment_votes_comment ON comment_votes(comment_id);
CREATE INDEX idx_comment_votes_user ON comment_votes(user_id);

-- Sort approved questions by vote_score
CREATE INDEX idx_question_posts_vote_score ON question_posts(vote_score DESC) WHERE status = 'approved';

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE question_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_improvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_votes ENABLE ROW LEVEL SECURITY;

-- Question votes
CREATE POLICY "Public read question votes"
  ON question_votes FOR SELECT USING (true);
CREATE POLICY "Service role full access question votes"
  ON question_votes FOR ALL USING (true) WITH CHECK (true);

-- Improvements: public read for approved ones
CREATE POLICY "Public read approved improvements"
  ON question_improvements FOR SELECT
  USING (status = 'approved');
CREATE POLICY "Authors see own improvements"
  ON question_improvements FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Service role full access improvements"
  ON question_improvements FOR ALL USING (true) WITH CHECK (true);

-- Improvement votes
CREATE POLICY "Public read improvement votes"
  ON improvement_votes FOR SELECT USING (true);
CREATE POLICY "Service role full access improvement votes"
  ON improvement_votes FOR ALL USING (true) WITH CHECK (true);

-- Comment votes
CREATE POLICY "Public read comment votes"
  ON comment_votes FOR SELECT USING (true);
CREATE POLICY "Service role full access comment votes"
  ON comment_votes FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- TRIGGERS: Vote counts for question_votes
-- ============================================

CREATE OR REPLACE FUNCTION update_question_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote = 'up' THEN
      UPDATE question_posts SET vote_score = vote_score + 1, upvote_count = upvote_count + 1 WHERE id = NEW.question_id;
    ELSE
      UPDATE question_posts SET vote_score = vote_score - 1, downvote_count = downvote_count + 1 WHERE id = NEW.question_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote = 'up' THEN
      UPDATE question_posts SET vote_score = GREATEST(vote_score - 1, 0), upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = OLD.question_id;
    ELSE
      UPDATE question_posts SET vote_score = vote_score + 1, downvote_count = GREATEST(downvote_count - 1, 0) WHERE id = OLD.question_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.vote = 'up' AND NEW.vote = 'down' THEN
      UPDATE question_posts SET vote_score = vote_score - 2, upvote_count = GREATEST(upvote_count - 1, 0), downvote_count = downvote_count + 1 WHERE id = NEW.question_id;
    ELSIF OLD.vote = 'down' AND NEW.vote = 'up' THEN
      UPDATE question_posts SET vote_score = vote_score + 2, upvote_count = upvote_count + 1, downvote_count = GREATEST(downvote_count - 1, 0) WHERE id = NEW.question_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_vote_counts
  AFTER INSERT OR DELETE OR UPDATE ON question_votes
  FOR EACH ROW EXECUTE FUNCTION update_question_vote_counts();

-- ============================================
-- TRIGGERS: Vote counts for improvement_votes
-- ============================================

CREATE OR REPLACE FUNCTION update_improvement_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote = 'up' THEN
      UPDATE question_improvements SET vote_score = vote_score + 1, upvote_count = upvote_count + 1 WHERE id = NEW.improvement_id;
    ELSE
      UPDATE question_improvements SET vote_score = vote_score - 1, downvote_count = downvote_count + 1 WHERE id = NEW.improvement_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote = 'up' THEN
      UPDATE question_improvements SET vote_score = GREATEST(vote_score - 1, 0), upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = OLD.improvement_id;
    ELSE
      UPDATE question_improvements SET vote_score = vote_score + 1, downvote_count = GREATEST(downvote_count - 1, 0) WHERE id = OLD.improvement_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.vote = 'up' AND NEW.vote = 'down' THEN
      UPDATE question_improvements SET vote_score = vote_score - 2, upvote_count = GREATEST(upvote_count - 1, 0), downvote_count = downvote_count + 1 WHERE id = NEW.improvement_id;
    ELSIF OLD.vote = 'down' AND NEW.vote = 'up' THEN
      UPDATE question_improvements SET vote_score = vote_score + 2, upvote_count = upvote_count + 1, downvote_count = GREATEST(downvote_count - 1, 0) WHERE id = NEW.improvement_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_improvement_vote_counts
  AFTER INSERT OR DELETE OR UPDATE ON improvement_votes
  FOR EACH ROW EXECUTE FUNCTION update_improvement_vote_counts();

-- ============================================
-- TRIGGERS: Vote counts for comment_votes
-- ============================================

CREATE OR REPLACE FUNCTION update_comment_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote = 'up' THEN
      UPDATE question_comments SET vote_score = vote_score + 1 WHERE id = NEW.comment_id;
    ELSE
      UPDATE question_comments SET vote_score = vote_score - 1 WHERE id = NEW.comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote = 'up' THEN
      UPDATE question_comments SET vote_score = GREATEST(vote_score - 1, 0) WHERE id = OLD.comment_id;
    ELSE
      UPDATE question_comments SET vote_score = vote_score + 1 WHERE id = OLD.comment_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.vote = 'up' AND NEW.vote = 'down' THEN
      UPDATE question_comments SET vote_score = vote_score - 2 WHERE id = NEW.comment_id;
    ELSIF OLD.vote = 'down' AND NEW.vote = 'up' THEN
      UPDATE question_comments SET vote_score = vote_score + 2 WHERE id = NEW.comment_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_vote_counts
  AFTER INSERT OR DELETE OR UPDATE ON comment_votes
  FOR EACH ROW EXECUTE FUNCTION update_comment_vote_counts();

-- ============================================
-- TRIGGERS: Improvement count on question_posts
-- ============================================

CREATE OR REPLACE FUNCTION update_question_improvement_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE question_posts SET improvement_count = improvement_count + 1 WHERE id = NEW.question_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE question_posts SET improvement_count = GREATEST(improvement_count - 1, 0) WHERE id = OLD.question_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_improvement_count
  AFTER INSERT OR DELETE ON question_improvements
  FOR EACH ROW EXECUTE FUNCTION update_question_improvement_count();

-- Updated_at trigger for improvements
CREATE TRIGGER trg_improvement_updated_at
  BEFORE UPDATE ON question_improvements
  FOR EACH ROW EXECUTE FUNCTION update_question_post_updated_at();

-- ============================================
-- DATA MIGRATION: Convert existing likes to votes
-- ============================================

-- Migrate question likes to question votes (all as upvotes)
INSERT INTO question_votes (question_id, user_id, vote, created_at)
SELECT question_id, user_id, 'up'::vote_type, created_at
FROM question_likes
ON CONFLICT DO NOTHING;

-- Set upvote_count = vote_score for existing data
UPDATE question_posts SET upvote_count = vote_score WHERE vote_score > 0;

-- Migrate comment likes to comment votes (all as upvotes)
INSERT INTO comment_votes (comment_id, user_id, vote, created_at)
SELECT comment_id, user_id, 'up'::vote_type, created_at
FROM comment_likes
ON CONFLICT DO NOTHING;

-- Note: Old question_likes and comment_likes tables kept for safety.
-- Drop them in a future migration once verified.
