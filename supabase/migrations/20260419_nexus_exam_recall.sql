-- ============================================================
-- Nexus Exam Recall Feature
-- Collaborative question reconstruction platform for NATA
-- Migration: 20260419_nexus_exam_recall
-- ============================================================

-- Ensure set_updated_at function exists
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Table 1: nexus_exam_recall_threads
-- One per unique recalled question cluster
CREATE TABLE IF NOT EXISTS nexus_exam_recall_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exam_year INTEGER NOT NULL DEFAULT 2026,
  exam_date DATE NOT NULL,
  session_number INTEGER NOT NULL DEFAULT 1,  -- 1=morning, 2=afternoon
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'numerical', 'fill_blank', 'drawing')),
  section TEXT NOT NULL CHECK (section IN ('part_a', 'part_b')),
  topic_category TEXT,  -- from NATA syllabus: visual_reasoning, logical_derivation, gk_architecture, language, design_sensitivity, numerical_ability, drawing
  has_image BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw', 'under_review', 'published', 'dismissed')),
  published_question_id UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL,
  confirm_count INTEGER NOT NULL DEFAULT 0,
  vouch_count INTEGER NOT NULL DEFAULT 0,
  version_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nexus_exam_recall_threads IS 'One thread per unique recalled question cluster from an exam session';

-- Table 2: nexus_exam_recall_versions
-- Each student''s version of a recalled question within a thread
CREATE TABLE IF NOT EXISTS nexus_exam_recall_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES nexus_exam_recall_threads(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  author_id UUID NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL DEFAULT 'student' CHECK (author_role IN ('student', 'teacher', 'admin', 'staff')),
  recall_text TEXT,
  recall_image_urls TEXT[],
  options JSONB,  -- for MCQ: [{id:"a",text:"..."},{id:"b",text:"..."}]
  my_answer TEXT,
  my_working TEXT,
  clarity TEXT NOT NULL DEFAULT 'partial' CHECK (clarity IN ('clear', 'partial', 'vague')),
  has_image_in_original BOOLEAN,
  image_description TEXT,
  sub_topic_hint TEXT,  -- free text: "Mensuration - Cone/Sphere"
  parent_version_id UUID REFERENCES nexus_exam_recall_versions(id) ON DELETE SET NULL,
  vouch_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nexus_exam_recall_versions IS 'Each student version of a recalled question within a thread. Never overwrite — always add new version.';

-- Table 3: nexus_exam_recall_confirms
-- "I also got this question" — factual confirmation per user per thread
CREATE TABLE IF NOT EXISTS nexus_exam_recall_confirms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES nexus_exam_recall_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  exam_date DATE,  -- the date THEY got this question (may differ for repeats)
  session_number INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(thread_id, user_id)
);
COMMENT ON TABLE nexus_exam_recall_confirms IS 'Factual confirmation: "I also got this question" — one per user per thread';

-- Table 4: nexus_exam_recall_vouches
-- "This version is accurate" — quality signal per user per version
CREATE TABLE IF NOT EXISTS nexus_exam_recall_vouches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES nexus_exam_recall_versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(version_id, user_id)
);
COMMENT ON TABLE nexus_exam_recall_vouches IS 'Quality signal: "This version is accurate" — one per user per version';

-- Table 5: nexus_exam_recall_comments
-- Teacher-student discussion per thread
CREATE TABLE IF NOT EXISTS nexus_exam_recall_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES nexus_exam_recall_threads(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES nexus_exam_recall_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nexus_exam_recall_comments IS 'Teacher-student discussion threads per recalled question';

-- Table 6: nexus_exam_recall_checkpoints
-- Tracks student contribution progress toward unlock gate
CREATE TABLE IF NOT EXISTS nexus_exam_recall_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exam_year INTEGER NOT NULL DEFAULT 2026,
  exam_date DATE NOT NULL,
  session_number INTEGER NOT NULL DEFAULT 1,
  drawing_count INTEGER NOT NULL DEFAULT 0,
  aptitude_count INTEGER NOT NULL DEFAULT 0,
  topic_dump_count INTEGER NOT NULL DEFAULT 0,
  tip_submitted BOOLEAN NOT NULL DEFAULT false,
  browse_unlocked BOOLEAN NOT NULL DEFAULT false,
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, classroom_id, exam_date, session_number)
);
COMMENT ON TABLE nexus_exam_recall_checkpoints IS 'Tracks student contribution progress toward browse-unlock gate';

-- Table 7: nexus_exam_recall_topic_dumps
-- Quick topic + count entries for students who list topics, not individual questions
CREATE TABLE IF NOT EXISTS nexus_exam_recall_topic_dumps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exam_year INTEGER NOT NULL DEFAULT 2026,
  exam_date DATE NOT NULL,
  session_number INTEGER NOT NULL DEFAULT 1,
  topic_category TEXT NOT NULL,
  estimated_count INTEGER,
  brief_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nexus_exam_recall_topic_dumps IS 'Quick topic + count entries for students who list topics instead of individual questions';

-- Table 8: nexus_exam_recall_drawings
-- Structured Part A (Drawing) question recalls
CREATE TABLE IF NOT EXISTS nexus_exam_recall_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES nexus_exam_recall_threads(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL CHECK (question_number BETWEEN 1 AND 3),
  drawing_type TEXT NOT NULL CHECK (drawing_type IN ('composition_2d', 'object_sketching', '3d_model')),
  prompt_text_en TEXT,
  prompt_text_hi TEXT,
  objects_materials JSONB,  -- [{name:"triangle",count:4},{name:"circle",count:2}]
  constraints JSONB,  -- {color_restriction:"analogous only",intersection_allowed:true,theme:"spiraling tower"}
  marks INTEGER,  -- 25 or 30
  paper_photo_url TEXT,
  attempt_photo_url TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nexus_exam_recall_drawings IS 'Structured Part A (Drawing) question recalls with prompts, constraints, and photos';

-- Table 9: nexus_exam_recall_tips
-- Meta exam pattern insights per session
CREATE TABLE IF NOT EXISTS nexus_exam_recall_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exam_year INTEGER NOT NULL DEFAULT 2026,
  exam_date DATE NOT NULL,
  session_number INTEGER NOT NULL DEFAULT 1,
  insights_text TEXT NOT NULL,
  topic_distribution JSONB,  -- {visual_reasoning:35,numerical:20,...}
  difficulty TEXT CHECK (difficulty IN ('easy', 'moderate', 'hard')),
  time_pressure TEXT CHECK (time_pressure IN ('plenty', 'just_enough', 'rushed')),
  upvote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nexus_exam_recall_tips IS 'Meta exam pattern insights and tips per session';

-- Table 10: nexus_exam_recall_variants
-- Cross-session/cross-thread repeat and variant linking
CREATE TABLE IF NOT EXISTS nexus_exam_recall_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES nexus_exam_recall_threads(id) ON DELETE CASCADE,
  linked_thread_id UUID NOT NULL REFERENCES nexus_exam_recall_threads(id) ON DELETE CASCADE,
  variant_type TEXT NOT NULL CHECK (variant_type IN ('exact_repeat', 'different_values', 'same_topic')),
  confidence NUMERIC(3,2),  -- AI confidence score 0.00-1.00, NULL if manual
  linked_by UUID REFERENCES users(id),  -- NULL = AI-linked
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(thread_id, linked_thread_id),
  CHECK (thread_id != linked_thread_id)
);
COMMENT ON TABLE nexus_exam_recall_variants IS 'Cross-session/cross-thread repeat and variant linking between recalled questions';

-- Table 11: nexus_exam_recall_uploads
-- Photo uploads with OCR processing state
CREATE TABLE IF NOT EXISTS nexus_exam_recall_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  version_id UUID REFERENCES nexus_exam_recall_versions(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES nexus_exam_recall_threads(id) ON DELETE SET NULL,
  upload_type TEXT NOT NULL CHECK (upload_type IN ('handwritten_notes', 'question_paper', 'reference_image', 'sketch', 'drawing_attempt')),
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed', 'not_needed')),
  ocr_extracted_text TEXT,
  ocr_confidence NUMERIC(3,2),
  ocr_extracted_questions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nexus_exam_recall_uploads IS 'Photo uploads with OCR processing state for exam recall';

-- ============================================================
-- 2. INDEXES
-- ============================================================

-- Threads
CREATE INDEX IF NOT EXISTS idx_exam_recall_threads_classroom ON nexus_exam_recall_threads(classroom_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_threads_exam_date ON nexus_exam_recall_threads(exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_recall_threads_status ON nexus_exam_recall_threads(status);
CREATE INDEX IF NOT EXISTS idx_exam_recall_threads_created_by ON nexus_exam_recall_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_exam_recall_threads_classroom_date ON nexus_exam_recall_threads(classroom_id, exam_date, session_number);
CREATE INDEX IF NOT EXISTS idx_exam_recall_threads_status_date ON nexus_exam_recall_threads(status, exam_date DESC);

-- Versions
CREATE INDEX IF NOT EXISTS idx_exam_recall_versions_thread ON nexus_exam_recall_versions(thread_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_versions_author ON nexus_exam_recall_versions(author_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_versions_status ON nexus_exam_recall_versions(status);
CREATE INDEX IF NOT EXISTS idx_exam_recall_versions_thread_status ON nexus_exam_recall_versions(thread_id, status);

-- Confirms
CREATE INDEX IF NOT EXISTS idx_exam_recall_confirms_thread ON nexus_exam_recall_confirms(thread_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_confirms_user ON nexus_exam_recall_confirms(user_id);

-- Vouches
CREATE INDEX IF NOT EXISTS idx_exam_recall_vouches_version ON nexus_exam_recall_vouches(version_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_vouches_user ON nexus_exam_recall_vouches(user_id);

-- Comments
CREATE INDEX IF NOT EXISTS idx_exam_recall_comments_thread ON nexus_exam_recall_comments(thread_id);

-- Checkpoints
CREATE INDEX IF NOT EXISTS idx_exam_recall_checkpoints_user ON nexus_exam_recall_checkpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_checkpoints_classroom ON nexus_exam_recall_checkpoints(classroom_id);

-- Topic Dumps
CREATE INDEX IF NOT EXISTS idx_exam_recall_topic_dumps_user ON nexus_exam_recall_topic_dumps(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_topic_dumps_classroom ON nexus_exam_recall_topic_dumps(classroom_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_topic_dumps_user_classroom ON nexus_exam_recall_topic_dumps(user_id, classroom_id);

-- Drawings
CREATE INDEX IF NOT EXISTS idx_exam_recall_drawings_thread ON nexus_exam_recall_drawings(thread_id);

-- Tips
CREATE INDEX IF NOT EXISTS idx_exam_recall_tips_classroom_date ON nexus_exam_recall_tips(classroom_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_recall_tips_user ON nexus_exam_recall_tips(user_id);

-- Variants
CREATE INDEX IF NOT EXISTS idx_exam_recall_variants_thread ON nexus_exam_recall_variants(thread_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_variants_linked ON nexus_exam_recall_variants(linked_thread_id);

-- Uploads
CREATE INDEX IF NOT EXISTS idx_exam_recall_uploads_user ON nexus_exam_recall_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_uploads_version ON nexus_exam_recall_uploads(version_id);
CREATE INDEX IF NOT EXISTS idx_exam_recall_uploads_ocr_status ON nexus_exam_recall_uploads(ocr_status);
CREATE INDEX IF NOT EXISTS idx_exam_recall_uploads_thread ON nexus_exam_recall_uploads(thread_id);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE nexus_exam_recall_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_confirms ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_vouches ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_topic_dumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_recall_uploads ENABLE ROW LEVEL SECURITY;

-- Service role full access (matching existing Nexus pattern — API routes use admin client)
CREATE POLICY "service_role_exam_recall_threads" ON nexus_exam_recall_threads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_versions" ON nexus_exam_recall_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_confirms" ON nexus_exam_recall_confirms FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_vouches" ON nexus_exam_recall_vouches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_comments" ON nexus_exam_recall_comments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_checkpoints" ON nexus_exam_recall_checkpoints FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_topic_dumps" ON nexus_exam_recall_topic_dumps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_drawings" ON nexus_exam_recall_drawings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_tips" ON nexus_exam_recall_tips FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_variants" ON nexus_exam_recall_variants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exam_recall_uploads" ON nexus_exam_recall_uploads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. TRIGGERS
-- ============================================================

-- Auto-update updated_at on threads
CREATE TRIGGER set_exam_recall_threads_updated_at
  BEFORE UPDATE ON nexus_exam_recall_threads
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Auto-update updated_at on comments
CREATE TRIGGER set_exam_recall_comments_updated_at
  BEFORE UPDATE ON nexus_exam_recall_comments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Auto-update updated_at on checkpoints
CREATE TRIGGER set_exam_recall_checkpoints_updated_at
  BEFORE UPDATE ON nexus_exam_recall_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 14. NOTIFICATION EVENT TYPES
-- ============================================================

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'recall_version_added';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'recall_confirmed';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'recall_version_approved';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'recall_version_rejected';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'recall_comment_added';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'recall_published';
