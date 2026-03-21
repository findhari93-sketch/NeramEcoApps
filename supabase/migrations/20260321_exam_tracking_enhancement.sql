-- ============================================
-- EXAM TRACKING ENHANCEMENT
-- Official exam dates, student registrations,
-- per-attempt tracking, teacher broadcasts
-- ============================================

-- ============================================
-- 1. EXAM DATES (teacher-managed)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_exam_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('nata', 'jee')),
  year INTEGER NOT NULL DEFAULT 2026,
  phase TEXT NOT NULL CHECK (phase IN ('phase_1', 'phase_2', 'session_1', 'session_2')),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  exam_date DATE NOT NULL,
  label TEXT,
  registration_deadline DATE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exam_type, year, phase, attempt_number, exam_date)
);

-- ============================================
-- 2. STUDENT EXAM REGISTRATIONS (one per student+exam)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_student_exam_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('nata', 'jee')),
  is_writing BOOLEAN DEFAULT false,
  application_number TEXT,
  application_summary_doc_id UUID REFERENCES nexus_student_documents(id),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, classroom_id, exam_type)
);

-- ============================================
-- 3. STUDENT EXAM ATTEMPTS (per-attempt tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_student_exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('nata', 'jee')),
  phase TEXT NOT NULL CHECK (phase IN ('phase_1', 'phase_2', 'session_1', 'session_2')),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  exam_date_id UUID REFERENCES nexus_exam_dates(id),
  state TEXT NOT NULL DEFAULT 'planning' CHECK (state IN ('planning', 'applied', 'completed', 'scorecard_uploaded')),
  application_date DATE,
  exam_completed_at TIMESTAMPTZ,
  scorecard_reminder_sent BOOLEAN DEFAULT false,
  aptitude_score NUMERIC(6,2),
  drawing_score NUMERIC(6,2),
  total_score NUMERIC(6,2),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, classroom_id, exam_type, phase, attempt_number)
);

-- ============================================
-- 4. EXAM BROADCASTS (teacher notifications)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_exam_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('nata', 'jee')),
  broadcast_type TEXT NOT NULL CHECK (broadcast_type IN ('scorecard_released', 'registration_reminder', 'general')),
  message TEXT,
  sent_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. ALTER nexus_student_documents
-- ============================================

ALTER TABLE nexus_student_documents
  ADD COLUMN IF NOT EXISTS exam_attempt_id UUID REFERENCES nexus_student_exam_attempts(id);

-- ============================================
-- 6. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nexus_exam_dates_type_year ON nexus_exam_dates(exam_type, year);
CREATE INDEX IF NOT EXISTS idx_nexus_exam_dates_active ON nexus_exam_dates(is_active);

CREATE INDEX IF NOT EXISTS idx_nexus_exam_registrations_student ON nexus_student_exam_registrations(student_id, classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_exam_registrations_type ON nexus_student_exam_registrations(exam_type);

CREATE INDEX IF NOT EXISTS idx_nexus_exam_attempts_student ON nexus_student_exam_attempts(student_id, classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_exam_attempts_type ON nexus_student_exam_attempts(exam_type);
CREATE INDEX IF NOT EXISTS idx_nexus_exam_attempts_state ON nexus_student_exam_attempts(state);
CREATE INDEX IF NOT EXISTS idx_nexus_exam_attempts_exam_date ON nexus_student_exam_attempts(exam_date_id);

CREATE INDEX IF NOT EXISTS idx_nexus_exam_broadcasts_classroom ON nexus_exam_broadcasts(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_exam_broadcasts_type ON nexus_exam_broadcasts(exam_type);

CREATE INDEX IF NOT EXISTS idx_nexus_student_documents_attempt ON nexus_student_documents(exam_attempt_id);

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_exam_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_exam_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_broadcasts ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON nexus_exam_dates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_student_exam_registrations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_student_exam_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_exam_broadcasts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Exam dates: anyone authenticated can read active dates
CREATE POLICY "authenticated_read_active_exam_dates" ON nexus_exam_dates
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Exam dates: teachers can manage
CREATE POLICY "teachers_manage_exam_dates" ON nexus_exam_dates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Exam registrations: students manage their own
CREATE POLICY "students_manage_own_exam_registrations" ON nexus_student_exam_registrations
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Exam registrations: teachers can read in their classrooms
CREATE POLICY "teachers_read_exam_registrations" ON nexus_student_exam_registrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_student_exam_registrations.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Exam attempts: students manage their own
CREATE POLICY "students_manage_own_exam_attempts" ON nexus_student_exam_attempts
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Exam attempts: teachers can read in their classrooms
CREATE POLICY "teachers_read_exam_attempts" ON nexus_student_exam_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_student_exam_attempts.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Broadcasts: teachers can create in their classrooms
CREATE POLICY "teachers_manage_broadcasts" ON nexus_exam_broadcasts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_exam_broadcasts.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_exam_broadcasts.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Broadcasts: students can read broadcasts in their classrooms
CREATE POLICY "students_read_broadcasts" ON nexus_exam_broadcasts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_exam_broadcasts.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'student'
      AND nexus_enrollments.is_active = true
    )
  );
