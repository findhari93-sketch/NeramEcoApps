-- ============================================================
-- Nexus Question Bank Module
-- PYQ Learning System for JEE Paper 2 & NATA
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Topics (hierarchical)
CREATE TABLE IF NOT EXISTS nexus_qb_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES nexus_qb_topics(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Original exam papers (PDFs)
CREATE TABLE IF NOT EXISTS nexus_qb_original_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('JEE_PAPER_2', 'NATA')),
  year INTEGER NOT NULL,
  session TEXT,
  pdf_url TEXT NOT NULL,
  total_questions INTEGER,
  total_marks INTEGER,
  duration_minutes INTEGER,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(exam_type, year, session)
);

-- Main questions table
CREATE TABLE IF NOT EXISTS nexus_qb_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  question_text TEXT,
  question_image_url TEXT,
  question_format TEXT NOT NULL DEFAULT 'MCQ'
    CHECK (question_format IN ('MCQ', 'NUMERICAL', 'DRAWING_PROMPT', 'IMAGE_BASED')),

  -- Answer
  options JSONB,  -- [{id:"a", text:"...", image_url:"..."}, ...]
  correct_answer TEXT NOT NULL,
  answer_tolerance NUMERIC,  -- For NUMERICAL type

  -- Solutions
  explanation_brief TEXT NOT NULL,
  explanation_detailed TEXT,
  solution_image_url TEXT,
  solution_video_url TEXT,

  -- Classification
  difficulty TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  exam_relevance TEXT NOT NULL DEFAULT 'BOTH'
    CHECK (exam_relevance IN ('JEE', 'NATA', 'BOTH')),
  categories TEXT[] NOT NULL DEFAULT '{}',
  topic_id UUID REFERENCES nexus_qb_topics(id) ON DELETE SET NULL,
  sub_topic TEXT,

  -- Repeat tracking
  repeat_group_id UUID,

  -- Paper context
  original_paper_id UUID REFERENCES nexus_qb_original_papers(id) ON DELETE SET NULL,
  original_paper_page INTEGER,
  display_order INTEGER,

  -- System
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Must have either text or image
  CONSTRAINT question_has_content CHECK (question_text IS NOT NULL OR question_image_url IS NOT NULL)
);

-- Question sources (junction: question <-> exam appearances)
CREATE TABLE IF NOT EXISTS nexus_qb_question_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('JEE_PAPER_2', 'NATA')),
  year INTEGER NOT NULL,
  session TEXT,
  question_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(question_id, exam_type, year, session)
);

-- Student attempts
CREATE TABLE IF NOT EXISTS nexus_qb_student_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  selected_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent_seconds INTEGER,
  mode TEXT NOT NULL DEFAULT 'practice'
    CHECK (mode IN ('practice', 'year_paper')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Study marks (study mode "studied" toggle)
CREATE TABLE IF NOT EXISTS nexus_qb_study_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(student_id, question_id)
);

-- Saved filter presets
CREATE TABLE IF NOT EXISTS nexus_qb_saved_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Classroom links (controls which classrooms have QB access)
CREATE TABLE IF NOT EXISTS nexus_qb_classroom_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled_by UUID REFERENCES users(id),

  UNIQUE(classroom_id)
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

-- Topics
CREATE INDEX IF NOT EXISTS idx_nexus_qb_topics_parent ON nexus_qb_topics(parent_id) WHERE is_active = true;

-- Questions: filtering performance
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_topic ON nexus_qb_questions(topic_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_difficulty ON nexus_qb_questions(difficulty) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_format ON nexus_qb_questions(question_format) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_relevance ON nexus_qb_questions(exam_relevance) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_active ON nexus_qb_questions(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_repeat_group ON nexus_qb_questions(repeat_group_id) WHERE repeat_group_id IS NOT NULL;

-- GIN index for array column
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_categories ON nexus_qb_questions USING GIN(categories);

-- Question sources
CREATE INDEX IF NOT EXISTS idx_nexus_qb_sources_question ON nexus_qb_question_sources(question_id);
CREATE INDEX IF NOT EXISTS idx_nexus_qb_sources_exam ON nexus_qb_question_sources(exam_type, year);
CREATE INDEX IF NOT EXISTS idx_nexus_qb_sources_year ON nexus_qb_question_sources(year DESC);

-- Attempts
CREATE INDEX IF NOT EXISTS idx_nexus_qb_attempts_student ON nexus_qb_student_attempts(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_qb_attempts_question ON nexus_qb_student_attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_nexus_qb_attempts_student_question ON nexus_qb_student_attempts(student_id, question_id);

-- Study marks
CREATE INDEX IF NOT EXISTS idx_nexus_qb_study_marks_student ON nexus_qb_study_marks(student_id);

-- Presets
CREATE INDEX IF NOT EXISTS idx_nexus_qb_presets_student ON nexus_qb_saved_presets(student_id, is_pinned DESC);

-- Classroom links
CREATE INDEX IF NOT EXISTS idx_nexus_qb_classroom_links_classroom ON nexus_qb_classroom_links(classroom_id) WHERE is_active = true;

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE nexus_qb_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_qb_original_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_qb_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_qb_question_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_qb_student_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_qb_study_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_qb_saved_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_qb_classroom_links ENABLE ROW LEVEL SECURITY;

-- Service role full access (matching existing Nexus pattern)
CREATE POLICY "service_role_qb_topics" ON nexus_qb_topics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_qb_papers" ON nexus_qb_original_papers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_qb_questions" ON nexus_qb_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_qb_sources" ON nexus_qb_question_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_qb_attempts" ON nexus_qb_student_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_qb_study_marks" ON nexus_qb_study_marks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_qb_presets" ON nexus_qb_saved_presets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_qb_classroom_links" ON nexus_qb_classroom_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. SEED DATA: Initial topic hierarchy
-- ============================================================

-- Parent topics
INSERT INTO nexus_qb_topics (name, slug, sort_order) VALUES
  ('Mathematics', 'mathematics', 1),
  ('Aptitude', 'aptitude', 2),
  ('Drawing', 'drawing', 3),
  ('General Knowledge', 'general-knowledge', 4),
  ('History of Architecture', 'history-of-architecture', 5),
  ('Building Materials & Construction', 'building-materials', 6),
  ('Building Services', 'building-services', 7),
  ('Planning & Urban Design', 'planning', 8),
  ('Sustainability & Climate', 'sustainability', 9),
  ('Famous Architects & Works', 'famous-architects', 10)
ON CONFLICT (slug) DO NOTHING;

-- Sub-topics: Mathematics
INSERT INTO nexus_qb_topics (name, slug, parent_id, sort_order) VALUES
  ('Algebra', 'math-algebra', (SELECT id FROM nexus_qb_topics WHERE slug = 'mathematics'), 1),
  ('Trigonometry', 'math-trigonometry', (SELECT id FROM nexus_qb_topics WHERE slug = 'mathematics'), 2),
  ('Geometry', 'math-geometry', (SELECT id FROM nexus_qb_topics WHERE slug = 'mathematics'), 3),
  ('Mensuration', 'math-mensuration', (SELECT id FROM nexus_qb_topics WHERE slug = 'mathematics'), 4),
  ('Statistics & Probability', 'math-stats', (SELECT id FROM nexus_qb_topics WHERE slug = 'mathematics'), 5)
ON CONFLICT (slug) DO NOTHING;

-- Sub-topics: Aptitude
INSERT INTO nexus_qb_topics (name, slug, parent_id, sort_order) VALUES
  ('Logical Reasoning', 'aptitude-logical', (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'), 1),
  ('Visual Reasoning', 'aptitude-visual', (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'), 2),
  ('Puzzles', 'aptitude-puzzles', (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'), 3),
  ('Pattern Recognition', 'aptitude-patterns', (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'), 4)
ON CONFLICT (slug) DO NOTHING;

-- Sub-topics: Drawing
INSERT INTO nexus_qb_topics (name, slug, parent_id, sort_order) VALUES
  ('Perspective Drawing', 'drawing-perspective', (SELECT id FROM nexus_qb_topics WHERE slug = 'drawing'), 1),
  ('Elevation & Plan', 'drawing-elevation', (SELECT id FROM nexus_qb_topics WHERE slug = 'drawing'), 2),
  ('Sketching & Composition', 'drawing-sketching', (SELECT id FROM nexus_qb_topics WHERE slug = 'drawing'), 3),
  ('3D Visualization', 'drawing-3d', (SELECT id FROM nexus_qb_topics WHERE slug = 'drawing'), 4)
ON CONFLICT (slug) DO NOTHING;

-- Sub-topics: History of Architecture
INSERT INTO nexus_qb_topics (name, slug, parent_id, sort_order) VALUES
  ('Ancient Architecture', 'history-ancient', (SELECT id FROM nexus_qb_topics WHERE slug = 'history-of-architecture'), 1),
  ('Medieval Architecture', 'history-medieval', (SELECT id FROM nexus_qb_topics WHERE slug = 'history-of-architecture'), 2),
  ('Mughal Architecture', 'history-mughal', (SELECT id FROM nexus_qb_topics WHERE slug = 'history-of-architecture'), 3),
  ('Colonial Architecture', 'history-colonial', (SELECT id FROM nexus_qb_topics WHERE slug = 'history-of-architecture'), 4),
  ('Modern Architecture', 'history-modern', (SELECT id FROM nexus_qb_topics WHERE slug = 'history-of-architecture'), 5),
  ('Contemporary Architecture', 'history-contemporary', (SELECT id FROM nexus_qb_topics WHERE slug = 'history-of-architecture'), 6)
ON CONFLICT (slug) DO NOTHING;
