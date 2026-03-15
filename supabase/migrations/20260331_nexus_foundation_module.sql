-- ============================================
-- NEXUS FOUNDATION MODULE
-- Self-paced video learning with section quizzes
-- Coursera-like learning experience for NATA/JEE Paper 2 foundation chapters
-- ============================================

-- 1. CHAPTERS (the 10 foundation chapters)
CREATE TABLE IF NOT EXISTS nexus_foundation_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  youtube_video_id TEXT NOT NULL,
  video_duration_seconds INTEGER,
  chapter_number INTEGER NOT NULL UNIQUE,
  min_quiz_score_pct INTEGER NOT NULL DEFAULT 80,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. SECTIONS (segments within each chapter's video)
CREATE TABLE IF NOT EXISTS nexus_foundation_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES nexus_foundation_chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_timestamp_seconds INTEGER NOT NULL,
  end_timestamp_seconds INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_timestamps CHECK (end_timestamp_seconds > start_timestamp_seconds)
);

CREATE INDEX idx_foundation_sections_chapter ON nexus_foundation_sections(chapter_id, sort_order);

-- 3. QUIZ QUESTIONS (per section, MCQ only)
CREATE TABLE IF NOT EXISTS nexus_foundation_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES nexus_foundation_sections(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('a', 'b', 'c', 'd')),
  explanation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_foundation_quiz_questions_section ON nexus_foundation_quiz_questions(section_id, sort_order);

-- 4. STUDENT CHAPTER PROGRESS
CREATE TABLE IF NOT EXISTS nexus_foundation_student_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES nexus_foundation_chapters(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_section_id UUID REFERENCES nexus_foundation_sections(id),
  last_video_position_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, chapter_id)
);

CREATE INDEX idx_foundation_progress_student ON nexus_foundation_student_progress(student_id);
CREATE INDEX idx_foundation_progress_chapter ON nexus_foundation_student_progress(chapter_id);

-- 5. SECTION QUIZ ATTEMPTS
CREATE TABLE IF NOT EXISTS nexus_foundation_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES nexus_foundation_sections(id) ON DELETE CASCADE,
  score_pct INTEGER NOT NULL CHECK (score_pct >= 0 AND score_pct <= 100),
  answers JSONB NOT NULL DEFAULT '{}',
  passed BOOLEAN NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_foundation_quiz_attempts_lookup
  ON nexus_foundation_quiz_attempts(student_id, section_id, attempt_number DESC);

-- 6. STUDENT NOTES (per section)
CREATE TABLE IF NOT EXISTS nexus_foundation_student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES nexus_foundation_sections(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL DEFAULT '',
  video_timestamp_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, section_id)
);

CREATE INDEX idx_foundation_notes_student ON nexus_foundation_student_notes(student_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_foundation_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_foundation_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_foundation_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_foundation_student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_foundation_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_foundation_student_notes ENABLE ROW LEVEL SECURITY;

-- Service role has full access to all tables
CREATE POLICY "service_role_foundation_chapters" ON nexus_foundation_chapters FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_foundation_sections" ON nexus_foundation_sections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_foundation_quiz_questions" ON nexus_foundation_quiz_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_foundation_student_progress" ON nexus_foundation_student_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_foundation_quiz_attempts" ON nexus_foundation_quiz_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_foundation_student_notes" ON nexus_foundation_student_notes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- SEED DATA: 10 Foundation Chapters (placeholder video IDs)
-- ============================================

INSERT INTO nexus_foundation_chapters (title, description, chapter_number, youtube_video_id, is_published) VALUES
  ('History of Architecture', 'From Indus Valley Civilization to modern architecture - covering Mauryan, Gupta, Pallava, Chola, Mughal and more.', 1, 'PLACEHOLDER_CH1', true),
  ('Islamic Architecture', 'Islamic architectural styles, mosques, minarets, domes, and Indo-Islamic fusion architecture.', 2, 'PLACEHOLDER_CH2', true),
  ('Famous Indian Buildings and Monuments', 'Iconic Indian structures - Taj Mahal, Red Fort, Qutub Minar, Parliament House and more.', 3, 'PLACEHOLDER_CH3', true),
  ('Architecture Around the World', 'Global architectural marvels - Egyptian pyramids, Greek temples, Gothic cathedrals, modern skyscrapers.', 4, 'PLACEHOLDER_CH4', true),
  ('Famous Architects', 'Life and works of legendary architects - Le Corbusier, Frank Lloyd Wright, Zaha Hadid, Charles Correa and more.', 5, 'PLACEHOLDER_CH5', true),
  ('Building Materials', 'Properties and uses of construction materials - brick, stone, concrete, steel, timber, glass.', 6, 'PLACEHOLDER_CH6', true),
  ('Building Constructions', 'Construction techniques, structural systems, foundations, walls, roofs, and modern methods.', 7, 'PLACEHOLDER_CH7', true),
  ('Architectural Terminology', 'Essential architectural vocabulary - arches, vaults, buttresses, facades, fenestration and more.', 8, 'PLACEHOLDER_CH8', true),
  ('Climatology', 'Climate-responsive architecture, passive cooling, ventilation, sun path, and sustainable design.', 9, 'PLACEHOLDER_CH9', true),
  ('Elements of Design', 'Fundamental design principles - line, form, shape, texture, color, balance, rhythm, proportion.', 10, 'PLACEHOLDER_CH10', true);

-- Seed sections for Chapter 1 (History of Architecture) as an example
-- Other chapters will have sections added when actual videos are created
INSERT INTO nexus_foundation_sections (chapter_id, title, start_timestamp_seconds, end_timestamp_seconds, sort_order)
SELECT id, 'Indus Valley Civilization (B.C. 3000-2000)', 0, 300, 1 FROM nexus_foundation_chapters WHERE chapter_number = 1
UNION ALL
SELECT id, 'Mauryan Dynasty (400 B.C.)', 300, 600, 2 FROM nexus_foundation_chapters WHERE chapter_number = 1
UNION ALL
SELECT id, 'Ashoka Period (250 B.C.)', 600, 900, 3 FROM nexus_foundation_chapters WHERE chapter_number = 1
UNION ALL
SELECT id, 'Buddhist Rock Cut Architecture', 900, 1200, 4 FROM nexus_foundation_chapters WHERE chapter_number = 1
UNION ALL
SELECT id, 'Gupta Period & Dravidian Style', 1200, 1500, 5 FROM nexus_foundation_chapters WHERE chapter_number = 1
UNION ALL
SELECT id, 'Cholas, Pandyas & Vijayanagara', 1500, 1800, 6 FROM nexus_foundation_chapters WHERE chapter_number = 1
UNION ALL
SELECT id, 'Northern Indo-Aryan Style (Orissa)', 1800, 2100, 7 FROM nexus_foundation_chapters WHERE chapter_number = 1;

-- Seed sample quiz questions for first section of Chapter 1
INSERT INTO nexus_foundation_quiz_questions (section_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, sort_order)
SELECT s.id,
  'The Indus Valley Civilization is also known as?',
  'Iron Age civilization', 'Bronze Age civilization', 'Stone Age civilization', 'Copper Age civilization',
  'b', 'The Indus Valley Civilization is also known as the Bronze Age civilization.', 1
FROM nexus_foundation_sections s
JOIN nexus_foundation_chapters c ON s.chapter_id = c.id
WHERE c.chapter_number = 1 AND s.sort_order = 1

UNION ALL

SELECT s.id,
  'Which bond pattern was used in Indus Valley construction?',
  'Flemish Bond', 'English Bond', 'Stretcher Bond', 'Header Bond',
  'b', 'The Indus Valley people used burnt brick laid in mud mortar as "English Bond".', 2
FROM nexus_foundation_sections s
JOIN nexus_foundation_chapters c ON s.chapter_id = c.id
WHERE c.chapter_number = 1 AND s.sort_order = 1

UNION ALL

SELECT s.id,
  'The two main cities explored from the Indus Valley Civilization are?',
  'Patna and Delhi', 'Mohenjo-Daro and Harappa', 'Lothal and Kalibangan', 'Taxila and Mathura',
  'b', 'The two cities at present explored are Mohenjo-Daro in Sindh and Harappa in southern Punjab.', 3
FROM nexus_foundation_sections s
JOIN nexus_foundation_chapters c ON s.chapter_id = c.id
WHERE c.chapter_number = 1 AND s.sort_order = 1;
