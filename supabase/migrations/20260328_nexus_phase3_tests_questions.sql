-- ============================================
-- NEXUS PHASE 3: Tests & Question Bank
-- ============================================
-- Tables: nexus_question_submissions, nexus_verified_questions,
--         nexus_tests, nexus_test_questions, nexus_test_attempts

-- ============================================
-- 1. QUESTION SUBMISSIONS (student-contributed after exams)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_question_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  exam_name TEXT NOT NULL,
  exam_date DATE,
  question_text TEXT NOT NULL,
  question_image_url TEXT,
  options JSONB,
  correct_answer TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'merged')),
  merged_into UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. VERIFIED QUESTIONS (teacher-curated bank)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_verified_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  question_image_url TEXT,
  question_type TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'true_false', 'short_answer', 'drawing', 'numerical')),
  options JSONB,
  correct_answer TEXT,
  explanation TEXT,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  source_exam TEXT,
  source_year INTEGER,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. TESTS (teacher-created assessments)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  test_type TEXT NOT NULL DEFAULT 'timed' CHECK (test_type IN ('untimed', 'timed', 'per_question_timer', 'model_test')),
  duration_minutes INTEGER,
  per_question_seconds INTEGER,
  total_marks NUMERIC(6,2),
  passing_marks NUMERIC(6,2),
  is_published BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  shuffle_questions BOOLEAN DEFAULT false,
  show_answers_after BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. TEST QUESTIONS (questions assigned to a test)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_test_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES nexus_tests(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES nexus_verified_questions(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  marks NUMERIC(4,2) DEFAULT 1,
  negative_marks NUMERIC(4,2) DEFAULT 0,
  UNIQUE(test_id, question_id)
);

-- ============================================
-- 5. TEST ATTEMPTS (student test sessions)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES nexus_tests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  time_spent_seconds INTEGER,
  answers JSONB DEFAULT '{}',
  score NUMERIC(6,2),
  total_marks NUMERIC(6,2),
  percentage NUMERIC(5,2),
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'graded', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nexus_question_submissions_classroom ON nexus_question_submissions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_question_submissions_student ON nexus_question_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_question_submissions_status ON nexus_question_submissions(status);
CREATE INDEX IF NOT EXISTS idx_nexus_verified_questions_classroom ON nexus_verified_questions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_verified_questions_topic ON nexus_verified_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_nexus_verified_questions_difficulty ON nexus_verified_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_nexus_tests_classroom ON nexus_tests(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_tests_published ON nexus_tests(is_published, is_active);
CREATE INDEX IF NOT EXISTS idx_nexus_test_questions_test ON nexus_test_questions(test_id);
CREATE INDEX IF NOT EXISTS idx_nexus_test_attempts_test ON nexus_test_attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_nexus_test_attempts_student ON nexus_test_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_test_attempts_status ON nexus_test_attempts(status);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_question_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_verified_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_test_attempts ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON nexus_question_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_verified_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_tests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_test_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_test_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Question submissions: students can read/create their own
CREATE POLICY "students_own_submissions" ON nexus_question_submissions
  FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "students_create_submissions" ON nexus_question_submissions
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());

-- Question submissions: teachers can read all in their classroom
CREATE POLICY "teachers_read_submissions" ON nexus_question_submissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_enrollments
    WHERE nexus_enrollments.classroom_id = nexus_question_submissions.classroom_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ));

-- Question submissions: teachers can update (verify/reject/merge)
CREATE POLICY "teachers_update_submissions" ON nexus_question_submissions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_enrollments
    WHERE nexus_enrollments.classroom_id = nexus_question_submissions.classroom_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ));

-- Verified questions: enrolled users can read
CREATE POLICY "enrolled_read_questions" ON nexus_verified_questions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_enrollments
    WHERE nexus_enrollments.classroom_id = nexus_verified_questions.classroom_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.is_active = true
  ));

-- Verified questions: teachers can manage
CREATE POLICY "teachers_manage_questions" ON nexus_verified_questions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_enrollments
    WHERE nexus_enrollments.classroom_id = nexus_verified_questions.classroom_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM nexus_enrollments
    WHERE nexus_enrollments.classroom_id = nexus_verified_questions.classroom_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ));

-- Tests: enrolled users can read published tests
CREATE POLICY "enrolled_read_tests" ON nexus_tests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_enrollments
    WHERE nexus_enrollments.classroom_id = nexus_tests.classroom_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.is_active = true
  ));

-- Tests: teachers can manage
CREATE POLICY "teachers_manage_tests" ON nexus_tests
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_enrollments
    WHERE nexus_enrollments.classroom_id = nexus_tests.classroom_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM nexus_enrollments
    WHERE nexus_enrollments.classroom_id = nexus_tests.classroom_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ));

-- Test questions: same as tests
CREATE POLICY "enrolled_read_test_questions" ON nexus_test_questions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_tests
    JOIN nexus_enrollments ON nexus_enrollments.classroom_id = nexus_tests.classroom_id
    WHERE nexus_tests.id = nexus_test_questions.test_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.is_active = true
  ));

CREATE POLICY "teachers_manage_test_questions" ON nexus_test_questions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_tests
    JOIN nexus_enrollments ON nexus_enrollments.classroom_id = nexus_tests.classroom_id
    WHERE nexus_tests.id = nexus_test_questions.test_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM nexus_tests
    JOIN nexus_enrollments ON nexus_enrollments.classroom_id = nexus_tests.classroom_id
    WHERE nexus_tests.id = nexus_test_questions.test_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ));

-- Test attempts: students can read/create their own
CREATE POLICY "students_own_attempts" ON nexus_test_attempts
  FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "students_create_attempts" ON nexus_test_attempts
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "students_update_own_attempts" ON nexus_test_attempts
  FOR UPDATE TO authenticated USING (student_id = auth.uid());

-- Test attempts: teachers can read all in their classroom
CREATE POLICY "teachers_read_attempts" ON nexus_test_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nexus_tests
    JOIN nexus_enrollments ON nexus_enrollments.classroom_id = nexus_tests.classroom_id
    WHERE nexus_tests.id = nexus_test_attempts.test_id
    AND nexus_enrollments.user_id = auth.uid()
    AND nexus_enrollments.role = 'teacher'
    AND nexus_enrollments.is_active = true
  ));
