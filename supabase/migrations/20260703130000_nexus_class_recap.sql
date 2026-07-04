-- ============================================
-- NEXUS CLASS RECAP
-- Turns a recorded Teams class into a gated, self-paced catch-up module.
-- A recording is split into timestamped checkpoints; each checkpoint has an
-- auto-generated MCQ quiz (from the class transcript). A late-joining student
-- must fully pass each checkpoint to unlock the next segment; the recap is not
-- "completed" until every checkpoint passes. Management can then track who has
-- and hasn't finished their missed classes.
--
-- Schema deliberately mirrors nexus_module_item_* (20260317_nexus_module_rich_content)
-- so the AI generator output shape and the quiz grading logic port over 1:1,
-- while keeping recaps isolated from the student-facing modules browser.
-- ============================================

-- 1. RECAP — one per recorded class.
-- scheduled_class_id is NULLABLE: a recap can be created either from a Nexus
-- scheduled class (candidate flow) OR ad-hoc from a pasted recording link for a
-- class that was scheduled directly in Teams (no nexus_scheduled_classes row).
CREATE TABLE IF NOT EXISTS nexus_class_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- Snapshot of the recording + transcript at generation time so we do not
  -- depend on the scheduled_class row keeping them.
  recording_url TEXT,
  transcript_url TEXT,
  video_source TEXT NOT NULL DEFAULT 'sharepoint', -- 'sharepoint' | 'youtube'
  video_duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  generated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_recaps_class ON nexus_class_recaps(scheduled_class_id);
CREATE INDEX IF NOT EXISTS idx_class_recaps_classroom ON nexus_class_recaps(classroom_id, status);

-- One recap per scheduled class (ad-hoc recaps have NULL scheduled_class_id and
-- are exempt from this constraint).
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_recaps_scheduled_class
  ON nexus_class_recaps(scheduled_class_id)
  WHERE scheduled_class_id IS NOT NULL;

-- 2. SECTIONS — timestamped checkpoints within the recording
CREATE TABLE IF NOT EXISTS nexus_class_recap_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id UUID NOT NULL REFERENCES nexus_class_recaps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_timestamp_seconds INTEGER NOT NULL,
  end_timestamp_seconds INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  min_questions_to_pass INTEGER, -- NULL = every question must be correct
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_recap_section_timestamps CHECK (end_timestamp_seconds > start_timestamp_seconds)
);

CREATE INDEX IF NOT EXISTS idx_class_recap_sections_recap ON nexus_class_recap_sections(recap_id, sort_order);

-- 3. QUESTIONS — MCQ per checkpoint
CREATE TABLE IF NOT EXISTS nexus_class_recap_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES nexus_class_recap_sections(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_class_recap_questions_section ON nexus_class_recap_questions(section_id, sort_order);

-- 4. PER-STUDENT RECAP PROGRESS
CREATE TABLE IF NOT EXISTS nexus_class_recap_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recap_id UUID NOT NULL REFERENCES nexus_class_recaps(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('locked', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_section_id UUID REFERENCES nexus_class_recap_sections(id) ON DELETE SET NULL,
  last_video_position_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, recap_id)
);

CREATE INDEX IF NOT EXISTS idx_class_recap_progress_student ON nexus_class_recap_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_class_recap_progress_recap ON nexus_class_recap_progress(recap_id);

-- 5. PER-SECTION QUIZ ATTEMPTS
CREATE TABLE IF NOT EXISTS nexus_class_recap_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES nexus_class_recap_sections(id) ON DELETE CASCADE,
  score_pct INTEGER CHECK (score_pct >= 0 AND score_pct <= 100),
  answers JSONB NOT NULL DEFAULT '{}',
  passed BOOLEAN,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_recap_attempts_lookup
  ON nexus_class_recap_attempts(student_id, section_id, attempt_number DESC);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE TRIGGER nexus_class_recaps_updated_at
  BEFORE UPDATE ON nexus_class_recaps
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

CREATE TRIGGER nexus_class_recap_progress_updated_at
  BEFORE UPDATE ON nexus_class_recap_progress
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (service_role only; all access via server routes)
-- ============================================

ALTER TABLE nexus_class_recaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_class_recap_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_class_recap_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_class_recap_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_class_recap_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON nexus_class_recaps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_class_recap_sections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_class_recap_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_class_recap_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_class_recap_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
