-- ============================================================
-- ASSIGNMENT QUESTIONS: answered in the app, marked by the machine
-- ------------------------------------------------------------
-- Three small changes that let an assignment hold real questions:
--   1. requires_pdf   - does the student still hand in worked solutions?
--   2. 'SUBJECTIVE'   - a question format with no machine answer key
--   3. 'assignment'   - a test kind for the paper behind an assignment
-- ============================================================

-- ------------------------------------------------------------
-- 1. Is a worked-solution PDF required?
-- ------------------------------------------------------------
-- The teacher decides per assignment. It is NOT inferred from the question mix:
-- a paper made entirely of numerical questions may still be one where the method
-- is the point, and only the teacher knows that.
--
-- When it is on, the upload comes FIRST and unlocks the answering step. Results
-- are instant, so a student who could answer first would see the correct values
-- and then write "working" to match them. Taking the working in before revealing
-- anything closes that.
--
-- DEFAULT true because every assignment that exists today is a PDF hand-in and
-- must keep behaving exactly as it does.
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS requires_pdf BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN nexus_class_assignments.requires_pdf IS
  'Whether the student must upload worked solutions. When true the upload gates the answering step, so answers are only revealed after the working is in. May only be turned off when the assignment has at least one auto-gradable question, otherwise there would be nothing to submit.';

-- ------------------------------------------------------------
-- 2. A question a machine must not mark
-- ------------------------------------------------------------
-- "Prove that the triangle is isosceles" has no single answer to key against.
-- The grader already handles this correctly without changes: gradeQBAnswerStrict
-- returns NULL, never true, for any format outside its gradable set, which is
-- precisely the "a human must mark this" signal. It only needed a format name
-- the CHECK would accept.
--
-- Drop and re-add rather than ALTER: the CHECK is cheap to rebuild and that is
-- the house rule set by 20260815090000_nexus_test_kind_taxonomy.sql.
ALTER TABLE nexus_qb_questions DROP CONSTRAINT IF EXISTS nexus_qb_questions_question_format_check;

ALTER TABLE nexus_qb_questions
  ADD CONSTRAINT nexus_qb_questions_question_format_check
  CHECK (question_format IN (
    'MCQ',
    'NUMERICAL',
    'DRAWING_PROMPT',
    'IMAGE_BASED',
    -- Written work judged by a teacher: proofs, derivations, "show that".
    'SUBJECTIVE'
  ));

-- ------------------------------------------------------------
-- 3. A test kind for the paper behind an assignment
-- ------------------------------------------------------------
-- Stored rather than inferred, like every other kind. It earns its own value
-- instead of reusing 'classroom_assigned' because api/tests must EXCLUDE it: an
-- assignment's paper is opened through the assignment, never as a standalone
-- test, exactly like the gated class_prep and catchup_class kinds.
--
-- The full list is restated because this constraint is rebuilt, not amended.
-- 'full' and 'chapter' are included: they belong to the taxonomy migration,
-- which sorts earlier and so has already run by the time this does.
ALTER TABLE nexus_tests DROP CONSTRAINT IF EXISTS nexus_tests_test_kind_check;

ALTER TABLE nexus_tests
  ADD CONSTRAINT nexus_tests_test_kind_check
  CHECK (test_kind IN (
    'class_prep',
    'catchup_class',
    'classroom_assigned',
    'practice_pool',
    'student_custom',
    'content_gate',
    'weekly',
    'mock',
    'full',
    'chapter',
    -- The questions inside one assignment. Never listed as a test of its own.
    'assignment'
  ));

-- One active paper per assignment, so a repeated save can never leave two
-- behind. Partial on is_active because deactivated placements are kept for
-- history, and uq_placement_test_context (which has no predicate) still governs
-- the revive-or-insert path in the query layer.
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_one_active_per_assignment
  ON nexus_test_placements(context_id)
  WHERE context_type = 'assignment' AND is_active = true;
