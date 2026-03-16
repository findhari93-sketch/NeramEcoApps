-- ============================================
-- Rich Content for Module Items
-- Mirrors Foundation infrastructure for generic modules
-- ============================================

-- 1. ENHANCE nexus_module_items with video fields
ALTER TABLE nexus_module_items
  ADD COLUMN IF NOT EXISTS video_source TEXT DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS sharepoint_video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS chapter_number INTEGER,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;

-- 2. MODULE ITEM SECTIONS — timestamped video segments
CREATE TABLE IF NOT EXISTS nexus_module_item_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_item_id UUID NOT NULL REFERENCES nexus_module_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_timestamp_seconds INTEGER NOT NULL,
  end_timestamp_seconds INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  min_questions_to_pass INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT check_section_timestamps CHECK (end_timestamp_seconds > start_timestamp_seconds)
);

CREATE INDEX IF NOT EXISTS idx_module_item_sections_item ON nexus_module_item_sections(module_item_id);
CREATE INDEX IF NOT EXISTS idx_module_item_sections_sort ON nexus_module_item_sections(module_item_id, sort_order);

-- 3. MODULE ITEM QUIZ QUESTIONS — MCQ per section
CREATE TABLE IF NOT EXISTS nexus_module_item_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES nexus_module_item_sections(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('a', 'b', 'c', 'd')),
  explanation TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_module_quiz_questions_section ON nexus_module_item_quiz_questions(section_id);

-- 4. MODULE STUDENT PROGRESS — per-item status tracking
CREATE TABLE IF NOT EXISTS nexus_module_student_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_item_id UUID NOT NULL REFERENCES nexus_module_items(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'locked' CHECK (status IN ('locked', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_section_id UUID REFERENCES nexus_module_item_sections(id) ON DELETE SET NULL,
  last_video_position_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, module_item_id)
);

CREATE INDEX IF NOT EXISTS idx_module_student_progress_student ON nexus_module_student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_module_student_progress_item ON nexus_module_student_progress(module_item_id);

-- 5. MODULE QUIZ ATTEMPTS — per-section quiz submissions
CREATE TABLE IF NOT EXISTS nexus_module_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES nexus_module_item_sections(id) ON DELETE CASCADE,
  score_pct INTEGER,
  answers JSONB DEFAULT '{}',
  passed BOOLEAN,
  attempt_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_module_quiz_attempts_student ON nexus_module_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_module_quiz_attempts_section ON nexus_module_quiz_attempts(section_id);

-- 6. MODULE STUDENT NOTES — per-section notes
CREATE TABLE IF NOT EXISTS nexus_module_student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES nexus_module_item_sections(id) ON DELETE CASCADE,
  note_text TEXT DEFAULT '',
  video_timestamp_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_module_student_notes_student ON nexus_module_student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_module_student_notes_section ON nexus_module_student_notes(section_id);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE TRIGGER nexus_module_student_progress_updated_at
  BEFORE UPDATE ON nexus_module_student_progress
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

CREATE TRIGGER nexus_module_student_notes_updated_at
  BEFORE UPDATE ON nexus_module_student_notes
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_module_item_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_module_item_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_module_student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_module_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_module_student_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON nexus_module_item_sections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_module_item_quiz_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_module_student_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_module_quiz_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_module_student_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
