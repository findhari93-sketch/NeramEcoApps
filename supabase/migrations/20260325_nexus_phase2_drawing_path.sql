-- ============================================
-- NEXUS PHASE 2: Drawing Learning Path Tables
-- ============================================
-- Tables: nexus_drawing_levels, nexus_drawing_categories,
--         nexus_drawing_exercises, nexus_drawing_submissions,
--         nexus_drawing_assignments, nexus_drawing_assignment_submissions

-- ============================================
-- 1. DRAWING LEVELS (Basic → Intermediate → Final)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_drawing_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. DRAWING CATEGORIES (groups within a level)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_drawing_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id UUID NOT NULL REFERENCES nexus_drawing_levels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. DRAWING EXERCISES
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_drawing_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES nexus_drawing_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  dos_and_donts TEXT,
  reference_images JSONB DEFAULT '[]',
  demo_video_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. DRAWING SUBMISSIONS (student uploads + teacher evaluations)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_drawing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES nexus_drawing_exercises(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_url TEXT NOT NULL,
  correction_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'redo', 'graded')),
  grade TEXT,
  teacher_notes TEXT,
  evaluated_by UUID REFERENCES users(id),
  evaluated_at TIMESTAMPTZ,
  attempt_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. DRAWING ASSIGNMENTS (homework tied to a class)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_drawing_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID REFERENCES nexus_scheduled_classes(id) ON DELETE SET NULL,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES nexus_drawing_exercises(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  due_date TIMESTAMPTZ
);

-- ============================================
-- 6. ASSIGNMENT SUBMISSION TRACKING (per-student)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_drawing_assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES nexus_drawing_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES nexus_drawing_submissions(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'not_submitted', 'excused')),
  submitted_at TIMESTAMPTZ,
  non_submission_reason TEXT,
  UNIQUE(assignment_id, student_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nexus_drawing_levels_classroom ON nexus_drawing_levels(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_categories_level ON nexus_drawing_categories(level_id);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_exercises_category ON nexus_drawing_exercises(category_id);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_submissions_exercise ON nexus_drawing_submissions(exercise_id);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_submissions_student ON nexus_drawing_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_submissions_status ON nexus_drawing_submissions(status);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_assignments_classroom ON nexus_drawing_assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_assignments_exercise ON nexus_drawing_assignments(exercise_id);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_assignment_subs_assignment ON nexus_drawing_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_nexus_drawing_assignment_subs_student ON nexus_drawing_assignment_submissions(student_id);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE TRIGGER nexus_drawing_submissions_updated_at
  BEFORE UPDATE ON nexus_drawing_submissions
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_drawing_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_drawing_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_drawing_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_drawing_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_drawing_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_drawing_assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON nexus_drawing_levels FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_drawing_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_drawing_exercises FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_drawing_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_drawing_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_drawing_assignment_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Drawing levels/categories/exercises: enrolled users can read
CREATE POLICY "enrolled_read_drawing_levels" ON nexus_drawing_levels
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_drawing_levels.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.is_active = true
    )
  );

CREATE POLICY "enrolled_read_drawing_categories" ON nexus_drawing_categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_drawing_levels dl
      JOIN nexus_enrollments e ON e.classroom_id = dl.classroom_id
      WHERE dl.id = nexus_drawing_categories.level_id
      AND e.user_id = auth.uid()
      AND e.is_active = true
    )
  );

CREATE POLICY "enrolled_read_drawing_exercises" ON nexus_drawing_exercises
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_drawing_categories dc
      JOIN nexus_drawing_levels dl ON dl.id = dc.level_id
      JOIN nexus_enrollments e ON e.classroom_id = dl.classroom_id
      WHERE dc.id = nexus_drawing_exercises.category_id
      AND e.user_id = auth.uid()
      AND e.is_active = true
    )
  );

-- Submissions: students see own, teachers see all in classroom
CREATE POLICY "students_own_submissions" ON nexus_drawing_submissions
  FOR ALL TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM nexus_drawing_exercises de
      JOIN nexus_drawing_categories dc ON dc.id = de.category_id
      JOIN nexus_drawing_levels dl ON dl.id = dc.level_id
      JOIN nexus_enrollments e ON e.classroom_id = dl.classroom_id
      WHERE de.id = nexus_drawing_submissions.exercise_id
      AND e.user_id = auth.uid()
      AND e.role = 'teacher'
      AND e.is_active = true
    )
  )
  WITH CHECK (student_id = auth.uid());

-- Teachers can update submissions (evaluate)
CREATE POLICY "teachers_evaluate_submissions" ON nexus_drawing_submissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_drawing_exercises de
      JOIN nexus_drawing_categories dc ON dc.id = de.category_id
      JOIN nexus_drawing_levels dl ON dl.id = dc.level_id
      JOIN nexus_enrollments e ON e.classroom_id = dl.classroom_id
      WHERE de.id = nexus_drawing_submissions.exercise_id
      AND e.user_id = auth.uid()
      AND e.role = 'teacher'
      AND e.is_active = true
    )
  );

-- Assignments: enrolled users can read
CREATE POLICY "enrolled_read_assignments" ON nexus_drawing_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_drawing_assignments.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.is_active = true
    )
  );

-- Teachers can manage assignments
CREATE POLICY "teachers_manage_assignments" ON nexus_drawing_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_drawing_assignments.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_drawing_assignments.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Assignment submissions: students see own, teachers see all
CREATE POLICY "students_own_assignment_subs" ON nexus_drawing_assignment_submissions
  FOR ALL TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM nexus_drawing_assignments da
      JOIN nexus_enrollments e ON e.classroom_id = da.classroom_id
      WHERE da.id = nexus_drawing_assignment_submissions.assignment_id
      AND e.user_id = auth.uid()
      AND e.role = 'teacher'
      AND e.is_active = true
    )
  )
  WITH CHECK (student_id = auth.uid());

-- Parents can read linked student's submissions
CREATE POLICY "parents_read_linked_submissions" ON nexus_drawing_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_parent_links
      WHERE nexus_parent_links.parent_user_id = auth.uid()
      AND nexus_parent_links.student_user_id = nexus_drawing_submissions.student_id
      AND nexus_parent_links.is_active = true
      AND nexus_parent_links.linked_at IS NOT NULL
    )
  );
