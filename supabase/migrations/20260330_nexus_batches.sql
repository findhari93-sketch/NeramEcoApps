-- ============================================
-- NEXUS: Batch Management within Classrooms
-- ============================================
-- Adds nexus_batches table for sub-grouping students within classrooms.
-- Content (topics, checklist, timetable) stays at classroom level.
-- Batches are purely organizational for student management.

-- ============================================
-- 1. BATCHES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(classroom_id, name)
);

-- ============================================
-- 2. ADD batch_id TO ENROLLMENTS
-- ============================================

ALTER TABLE nexus_enrollments
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES nexus_batches(id) ON DELETE SET NULL;

-- ============================================
-- 3. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nexus_batches_classroom ON nexus_batches(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_enrollments_batch ON nexus_enrollments(batch_id);

-- ============================================
-- 4. AUTO-UPDATE TIMESTAMP TRIGGER
-- ============================================

CREATE TRIGGER nexus_batches_updated_at
  BEFORE UPDATE ON nexus_batches
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_batches ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON nexus_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Enrolled users can read batches in their classrooms
CREATE POLICY "enrolled_users_read_batches" ON nexus_batches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_batches.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Teachers can manage batches in their classrooms
CREATE POLICY "teachers_manage_batches" ON nexus_batches
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_batches.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_batches.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );
