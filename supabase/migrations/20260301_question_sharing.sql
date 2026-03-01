-- ============================================
-- Question Sharing Feature (NATA Question Bank)
-- Community-shared exam questions with likes, comments, and moderation
-- ============================================

-- Enum for question status
CREATE TYPE question_post_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'flagged'
);

-- Enum for question category
CREATE TYPE nata_question_category AS ENUM (
  'mathematics',
  'general_aptitude',
  'drawing',
  'logical_reasoning',
  'aesthetic_sensitivity',
  'other'
);

-- ============================================
-- QUESTION POSTS TABLE
-- ============================================

CREATE TABLE question_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Question content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category nata_question_category NOT NULL DEFAULT 'other',

  -- Exam context
  exam_type TEXT NOT NULL DEFAULT 'NATA',
  exam_year INTEGER,
  exam_session TEXT,

  -- Media
  image_urls TEXT[] DEFAULT '{}',

  -- Tags
  tags TEXT[] DEFAULT '{}',

  -- Engagement counters (denormalized)
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,

  -- Moderation
  status question_post_status NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- QUESTION LIKES TABLE
-- ============================================

CREATE TABLE question_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(question_id, user_id)
);

-- ============================================
-- QUESTION COMMENTS TABLE
-- ============================================

CREATE TABLE question_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  parent_id UUID REFERENCES question_comments(id) ON DELETE CASCADE,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- COMMENT LIKES TABLE
-- ============================================

CREATE TABLE comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES question_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_question_posts_status ON question_posts(status, created_at DESC);
CREATE INDEX idx_question_posts_user ON question_posts(user_id, created_at DESC);
CREATE INDEX idx_question_posts_exam ON question_posts(exam_type, exam_year, status);
CREATE INDEX idx_question_posts_category ON question_posts(category, status);
CREATE INDEX idx_question_posts_approved ON question_posts(created_at DESC) WHERE status = 'approved';

CREATE INDEX idx_question_likes_question ON question_likes(question_id);
CREATE INDEX idx_question_likes_user ON question_likes(user_id);

CREATE INDEX idx_question_comments_question ON question_comments(question_id, created_at);
CREATE INDEX idx_question_comments_user ON question_comments(user_id);

CREATE INDEX idx_comment_likes_comment ON comment_likes(comment_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE question_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Questions: public read for approved, authors see own
CREATE POLICY "Public read approved questions"
  ON question_posts FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Authors see own questions"
  ON question_posts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access questions"
  ON question_posts FOR ALL
  USING (true) WITH CHECK (true);

-- Likes
CREATE POLICY "Public read likes"
  ON question_likes FOR SELECT USING (true);

CREATE POLICY "Service role full access likes"
  ON question_likes FOR ALL USING (true) WITH CHECK (true);

-- Comments
CREATE POLICY "Public read comments"
  ON question_comments FOR SELECT USING (true);

CREATE POLICY "Service role full access comments"
  ON question_comments FOR ALL USING (true) WITH CHECK (true);

-- Comment likes
CREATE POLICY "Public read comment likes"
  ON comment_likes FOR SELECT USING (true);

CREATE POLICY "Service role full access comment likes"
  ON comment_likes FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_question_post_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_post_updated_at
  BEFORE UPDATE ON question_posts
  FOR EACH ROW EXECUTE FUNCTION update_question_post_updated_at();

CREATE OR REPLACE FUNCTION update_question_comment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_comment_updated_at
  BEFORE UPDATE ON question_comments
  FOR EACH ROW EXECUTE FUNCTION update_question_comment_updated_at();

-- ============================================
-- TRIGGERS: Denormalized like/comment counts
-- ============================================

CREATE OR REPLACE FUNCTION update_question_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE question_posts SET like_count = like_count + 1 WHERE id = NEW.question_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE question_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.question_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_like_count
  AFTER INSERT OR DELETE ON question_likes
  FOR EACH ROW EXECUTE FUNCTION update_question_like_count();

CREATE OR REPLACE FUNCTION update_question_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE question_posts SET comment_count = comment_count + 1 WHERE id = NEW.question_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE question_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.question_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_comment_count
  AFTER INSERT OR DELETE ON question_comments
  FOR EACH ROW EXECUTE FUNCTION update_question_comment_count();

CREATE OR REPLACE FUNCTION update_comment_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE question_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE question_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_like_count
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION update_comment_like_count();
