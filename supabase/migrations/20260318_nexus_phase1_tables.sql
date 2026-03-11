-- ============================================
-- NEXUS PHASE 1: Core Classroom Management Tables
-- ============================================
-- Tables: nexus_classrooms, nexus_enrollments, nexus_parent_links,
--         nexus_topics, nexus_scheduled_classes, nexus_attendance,
--         nexus_checklist_items, nexus_checklist_resources,
--         nexus_student_checklist_progress, nexus_student_topic_progress

-- Add 'parent' to user_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'parent' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_type')) THEN
    ALTER TYPE user_type ADD VALUE 'parent';
  END IF;
END$$;

-- ============================================
-- 1. CLASSROOMS
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('nata', 'jee', 'revit', 'other')),
  description TEXT,
  ms_team_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. ENROLLMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, classroom_id)
);

-- ============================================
-- 3. PARENT-STUDENT LINKS
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_parent_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_token TEXT NOT NULL UNIQUE,
  invite_expires_at TIMESTAMPTZ NOT NULL,
  linked_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(parent_user_id, student_user_id)
);

-- ============================================
-- 4. TOPICS
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('mathematics', 'aptitude', 'drawing', 'architecture_awareness', 'general')),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. SCHEDULED CLASSES
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_scheduled_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  teams_meeting_url TEXT,
  teams_meeting_id TEXT,
  recording_url TEXT,
  recording_duration_minutes INTEGER,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled', 'rescheduled')),
  rescheduled_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. ATTENDANCE
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attended BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  source TEXT DEFAULT 'manual' CHECK (source IN ('teams', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scheduled_class_id, student_id)
);

-- ============================================
-- 7. CHECKLIST ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 8. CHECKLIST RESOURCES
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_checklist_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id UUID NOT NULL REFERENCES nexus_checklist_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  resource_type TEXT CHECK (resource_type IN ('pdf', 'image', 'youtube', 'onenote', 'link')),
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 9. STUDENT CHECKLIST PROGRESS
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_student_checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES nexus_checklist_items(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(student_id, checklist_item_id)
);

-- ============================================
-- 10. STUDENT TOPIC PROGRESS
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_student_topic_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES nexus_topics(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'attended', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  UNIQUE(student_id, topic_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nexus_enrollments_user ON nexus_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_nexus_enrollments_classroom ON nexus_enrollments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_topics_classroom ON nexus_topics(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_scheduled_classes_classroom ON nexus_scheduled_classes(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_scheduled_classes_date ON nexus_scheduled_classes(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_nexus_scheduled_classes_teacher ON nexus_scheduled_classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_nexus_attendance_class ON nexus_attendance(scheduled_class_id);
CREATE INDEX IF NOT EXISTS idx_nexus_attendance_student ON nexus_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_checklist_items_classroom ON nexus_checklist_items(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_checklist_items_topic ON nexus_checklist_items(topic_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_checklist_student ON nexus_student_checklist_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_topic_student ON nexus_student_topic_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_parent_links_token ON nexus_parent_links(invite_token);
CREATE INDEX IF NOT EXISTS idx_nexus_parent_links_student ON nexus_parent_links(student_user_id);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_nexus_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nexus_classrooms_updated_at
  BEFORE UPDATE ON nexus_classrooms
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

CREATE TRIGGER nexus_topics_updated_at
  BEFORE UPDATE ON nexus_topics
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

CREATE TRIGGER nexus_scheduled_classes_updated_at
  BEFORE UPDATE ON nexus_scheduled_classes
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

CREATE TRIGGER nexus_checklist_items_updated_at
  BEFORE UPDATE ON nexus_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_parent_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_scheduled_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_checklist_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_checklist_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_topic_progress ENABLE ROW LEVEL SECURITY;

-- Service role full access (for API routes)
CREATE POLICY "service_role_full_access" ON nexus_classrooms FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_enrollments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_parent_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_topics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_scheduled_classes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_attendance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_checklist_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_checklist_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_student_checklist_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_student_topic_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read classrooms they're enrolled in
CREATE POLICY "enrolled_users_read_classrooms" ON nexus_classrooms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_classrooms.id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Enrolled users can read enrollments in their classrooms
CREATE POLICY "enrolled_users_read_enrollments" ON nexus_enrollments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM nexus_enrollments e2
      WHERE e2.classroom_id = nexus_enrollments.classroom_id
      AND e2.user_id = auth.uid()
      AND e2.role = 'teacher'
      AND e2.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Parent links: parents see their own links, teachers see links for their classroom students
CREATE POLICY "parent_links_read" ON nexus_parent_links
  FOR SELECT TO authenticated
  USING (
    parent_user_id = auth.uid()
    OR student_user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type IN ('admin', 'teacher')
    )
  );

-- Topics: enrolled users can read
CREATE POLICY "enrolled_users_read_topics" ON nexus_topics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_topics.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Scheduled classes: enrolled users can read
CREATE POLICY "enrolled_users_read_classes" ON nexus_scheduled_classes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_scheduled_classes.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Teachers can insert/update scheduled classes
CREATE POLICY "teachers_manage_classes" ON nexus_scheduled_classes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_scheduled_classes.classroom_id
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
      WHERE nexus_enrollments.classroom_id = nexus_scheduled_classes.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Attendance: students see own, teachers see all in classroom
CREATE POLICY "students_own_attendance" ON nexus_attendance
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = (
        SELECT classroom_id FROM nexus_scheduled_classes WHERE id = nexus_attendance.scheduled_class_id
      )
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Checklist items: enrolled users read
CREATE POLICY "enrolled_users_read_checklist" ON nexus_checklist_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_checklist_items.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Teachers manage checklist items
CREATE POLICY "teachers_manage_checklist" ON nexus_checklist_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_checklist_items.classroom_id
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
      WHERE nexus_enrollments.classroom_id = nexus_checklist_items.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Checklist resources: same as checklist items
CREATE POLICY "enrolled_users_read_resources" ON nexus_checklist_resources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_checklist_items ci
      JOIN nexus_enrollments e ON e.classroom_id = ci.classroom_id
      WHERE ci.id = nexus_checklist_resources.checklist_item_id
      AND e.user_id = auth.uid()
      AND e.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Student checklist progress: students see own, teachers see classroom students
CREATE POLICY "student_own_checklist_progress" ON nexus_student_checklist_progress
  FOR ALL TO authenticated
  USING (
    student_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM nexus_checklist_items ci
      JOIN nexus_enrollments e ON e.classroom_id = ci.classroom_id
      WHERE ci.id = nexus_student_checklist_progress.checklist_item_id
      AND e.user_id = auth.uid()
      AND e.role = 'teacher'
      AND e.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND user_type = 'admin'
    )
  )
  WITH CHECK (
    student_id = auth.uid()
  );

-- Student topic progress: students see own, teachers see classroom students
CREATE POLICY "student_own_topic_progress" ON nexus_student_topic_progress
  FOR ALL TO authenticated
  USING (
    student_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_student_topic_progress.classroom_id
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
    student_id = auth.uid()
  );

-- Parent access: parents can read data of linked students
CREATE POLICY "parents_read_linked_attendance" ON nexus_attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_parent_links
      WHERE nexus_parent_links.parent_user_id = auth.uid()
      AND nexus_parent_links.student_user_id = nexus_attendance.student_id
      AND nexus_parent_links.is_active = true
      AND nexus_parent_links.linked_at IS NOT NULL
    )
  );

CREATE POLICY "parents_read_linked_checklist_progress" ON nexus_student_checklist_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_parent_links
      WHERE nexus_parent_links.parent_user_id = auth.uid()
      AND nexus_parent_links.student_user_id = nexus_student_checklist_progress.student_id
      AND nexus_parent_links.is_active = true
      AND nexus_parent_links.linked_at IS NOT NULL
    )
  );

CREATE POLICY "parents_read_linked_topic_progress" ON nexus_student_topic_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_parent_links
      WHERE nexus_parent_links.parent_user_id = auth.uid()
      AND nexus_parent_links.student_user_id = nexus_student_topic_progress.student_id
      AND nexus_parent_links.is_active = true
      AND nexus_parent_links.linked_at IS NOT NULL
    )
  );
