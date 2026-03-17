-- ============================================
-- Nexus Timetable + Teams Meeting Module
-- Adds: batch scoping, Teams meeting fields, RSVP, class reviews
-- ============================================

-- ============================================
-- 1. ADD BATCH SCOPING TO SCHEDULED CLASSES
-- NULL = classroom-wide (all batches), set = batch-specific
-- ============================================

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES nexus_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_scheduled_classes_batch
  ON nexus_scheduled_classes(batch_id);

-- ============================================
-- 2. ADD TEAMS MEETING FIELDS
-- ============================================

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS teams_meeting_join_url TEXT,
  ADD COLUMN IF NOT EXISTS transcript_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_fetched_at TIMESTAMPTZ;

-- ============================================
-- 3. RSVP TABLE (pre-class attendance intent)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_class_rsvp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('attending', 'not_attending')),
  reason TEXT,
  responded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scheduled_class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_rsvp_class ON nexus_class_rsvp(scheduled_class_id);
CREATE INDEX IF NOT EXISTS idx_nexus_rsvp_student ON nexus_class_rsvp(student_id);

-- ============================================
-- 4. CLASS REVIEWS TABLE (post-class feedback)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_class_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scheduled_class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_reviews_class ON nexus_class_reviews(scheduled_class_id);
CREATE INDEX IF NOT EXISTS idx_nexus_reviews_student ON nexus_class_reviews(student_id);

-- Updated_at trigger for reviews
CREATE TRIGGER nexus_class_reviews_updated_at
  BEFORE UPDATE ON nexus_class_reviews
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_class_rsvp ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_class_reviews ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON nexus_class_rsvp
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON nexus_class_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Students can manage their own RSVP
CREATE POLICY "students_own_rsvp" ON nexus_class_rsvp
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Teachers can read all RSVPs in their classrooms
CREATE POLICY "teachers_read_rsvp" ON nexus_class_rsvp
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_scheduled_classes sc
      JOIN nexus_enrollments e ON e.classroom_id = sc.classroom_id
      WHERE sc.id = nexus_class_rsvp.scheduled_class_id
        AND e.user_id = auth.uid()
        AND e.role = 'teacher'
        AND e.is_active = true
    )
  );

-- Students can manage their own reviews
CREATE POLICY "students_own_reviews" ON nexus_class_reviews
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Teachers can read all reviews in their classrooms
CREATE POLICY "teachers_read_reviews" ON nexus_class_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_scheduled_classes sc
      JOIN nexus_enrollments e ON e.classroom_id = sc.classroom_id
      WHERE sc.id = nexus_class_reviews.scheduled_class_id
        AND e.user_id = auth.uid()
        AND e.role = 'teacher'
        AND e.is_active = true
    )
  );
