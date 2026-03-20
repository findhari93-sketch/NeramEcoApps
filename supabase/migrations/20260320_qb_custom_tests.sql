-- ============================================
-- Custom Tests from Question Bank
-- Allow students to create custom tests from QB questions
-- ============================================

-- Add custom test support to nexus_tests
ALTER TABLE nexus_tests
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_student UUID REFERENCES users(id);

-- Index for student's custom tests
CREATE INDEX IF NOT EXISTS idx_nexus_tests_custom_student
  ON nexus_tests(created_by_student) WHERE is_custom = true;

-- Add qb_question_id to nexus_test_questions for QB-sourced questions
-- (question_id references nexus_verified_questions; qb_question_id references nexus_qb_questions)
ALTER TABLE nexus_test_questions
  ADD COLUMN IF NOT EXISTS qb_question_id UUID REFERENCES nexus_qb_questions(id) ON DELETE CASCADE;

-- Make question_id nullable so custom tests can use qb_question_id instead
ALTER TABLE nexus_test_questions
  ALTER COLUMN question_id DROP NOT NULL;

-- Index for qb question lookups
CREATE INDEX IF NOT EXISTS idx_nexus_test_questions_qb
  ON nexus_test_questions(qb_question_id) WHERE qb_question_id IS NOT NULL;

-- Add constraint: at least one of question_id or qb_question_id must be set
ALTER TABLE nexus_test_questions
  ADD CONSTRAINT chk_test_question_ref
  CHECK (question_id IS NOT NULL OR qb_question_id IS NOT NULL);
