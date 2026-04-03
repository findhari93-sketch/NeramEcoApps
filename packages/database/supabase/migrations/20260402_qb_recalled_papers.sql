-- ============================================================
-- NATA Recalled Papers — QB Schema Extensions
-- Adds confidence tiers, contributor tracking, topic intelligence
-- Migration: 20260402_qb_recalled_papers
-- ============================================================

-- ============================================================
-- 1A. Extend nexus_qb_original_papers
-- ============================================================

ALTER TABLE nexus_qb_original_papers
  ADD COLUMN IF NOT EXISTS paper_source TEXT NOT NULL DEFAULT 'official'
    CHECK (paper_source IN ('official', 'recalled')),
  ADD COLUMN IF NOT EXISTS exam_date DATE,
  ADD COLUMN IF NOT EXISTS contributor_summary JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN nexus_qb_original_papers.paper_source IS 'official = published papers, recalled = student-recalled questions';
COMMENT ON COLUMN nexus_qb_original_papers.exam_date IS 'Exact exam session date, e.g. 2025-03-13';
COMMENT ON COLUMN nexus_qb_original_papers.contributor_summary IS 'Denormalized: [{user_id, name, question_count, tier}]';

-- ============================================================
-- 1B. Extend nexus_qb_questions
-- ============================================================

ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS confidence_tier SMALLINT
    CHECK (confidence_tier IS NULL OR confidence_tier IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS answer_source TEXT
    CHECK (answer_source IS NULL OR answer_source IN ('official', 'teacher_verified', 'student_recalled', 'unverified')),
  ADD COLUMN IF NOT EXISTS figure_type TEXT
    CHECK (figure_type IS NULL OR figure_type IN ('original', 'recreated', 'reference', 'placeholder')),
  ADD COLUMN IF NOT EXISTS recall_thread_id UUID REFERENCES nexus_exam_recall_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drawing_marks INTEGER,
  ADD COLUMN IF NOT EXISTS design_principle_tested TEXT,
  ADD COLUMN IF NOT EXISTS colour_constraint TEXT,
  ADD COLUMN IF NOT EXISTS objects_to_include JSONB;

COMMENT ON COLUMN nexus_qb_questions.confidence_tier IS '1=Verified, 2=Recalled, 3=Topic Only. NULL for official papers.';
COMMENT ON COLUMN nexus_qb_questions.answer_source IS 'How the answer was obtained';
COMMENT ON COLUMN nexus_qb_questions.figure_type IS 'Type of figure/image attached';
COMMENT ON COLUMN nexus_qb_questions.recall_thread_id IS 'Link back to exam recall thread';
COMMENT ON COLUMN nexus_qb_questions.drawing_marks IS 'Marks for Part A drawing questions';
COMMENT ON COLUMN nexus_qb_questions.design_principle_tested IS 'e.g. Emphasis, Dynamism';
COMMENT ON COLUMN nexus_qb_questions.colour_constraint IS 'e.g. maximum 4 colours, analogous only';
COMMENT ON COLUMN nexus_qb_questions.objects_to_include IS 'JSON array: [{name, count}]';

-- ============================================================
-- 1C. New table: nexus_qb_paper_contributors
-- ============================================================

CREATE TABLE IF NOT EXISTS nexus_qb_paper_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES nexus_qb_original_papers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'teacher', 'admin')),
  question_count INTEGER NOT NULL DEFAULT 0,
  tier_1_count INTEGER NOT NULL DEFAULT 0,
  tier_2_count INTEGER NOT NULL DEFAULT 0,
  tier_3_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(paper_id, user_id)
);

COMMENT ON TABLE nexus_qb_paper_contributors IS 'Contributors who recalled questions for a paper/session';

-- ============================================================
-- 1D. Extend nexus_qb_topics (Topic Intelligence)
-- ============================================================

ALTER TABLE nexus_qb_topics
  ADD COLUMN IF NOT EXISTS study_content_md TEXT,
  ADD COLUMN IF NOT EXISTS study_video_urls TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS session_appearance_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority TEXT
    CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS sub_items JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN nexus_qb_topics.study_content_md IS 'Markdown study material, initially empty';
COMMENT ON COLUMN nexus_qb_topics.study_video_urls IS 'YouTube embed URLs for topic study material';
COMMENT ON COLUMN nexus_qb_topics.session_appearance_count IS 'How many exam sessions this topic appeared in';
COMMENT ON COLUMN nexus_qb_topics.priority IS 'Topic priority based on cross-session frequency';
COMMENT ON COLUMN nexus_qb_topics.sub_items IS 'Specific items under topic: [{name, description, sessions}]';

-- ============================================================
-- 1E. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_qb_questions_confidence_tier
  ON nexus_qb_questions(confidence_tier) WHERE confidence_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qb_questions_recall_thread
  ON nexus_qb_questions(recall_thread_id) WHERE recall_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qb_papers_source
  ON nexus_qb_original_papers(paper_source);

CREATE INDEX IF NOT EXISTS idx_qb_papers_exam_date
  ON nexus_qb_original_papers(exam_date) WHERE exam_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qb_paper_contributors_paper
  ON nexus_qb_paper_contributors(paper_id);

CREATE INDEX IF NOT EXISTS idx_qb_topics_priority
  ON nexus_qb_topics(priority) WHERE priority IS NOT NULL;

-- ============================================================
-- 1F. RLS for nexus_qb_paper_contributors
-- ============================================================

ALTER TABLE nexus_qb_paper_contributors ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by API routes)
CREATE POLICY "Service role full access on paper_contributors"
  ON nexus_qb_paper_contributors
  FOR ALL
  USING (true)
  WITH CHECK (true);
