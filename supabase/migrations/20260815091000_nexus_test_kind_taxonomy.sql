-- ============================================================================
-- TEST TAXONOMY: the kinds a teacher can actually choose
-- ============================================================================
-- nexus_tests.test_kind shipped with 'weekly' and 'mock' reserved and no writer,
-- so every teacher-set test was an undifferentiated 'classroom_assigned'. A
-- student looking at their Tests screen could not tell a weekly test from a
-- model paper from a chapter test, and the teacher hub rendered permanently
-- empty "Weekly tests" and "Mock tests" groups.
--
-- This adds the three kinds that were missing from the vocabulary and gives all
-- five a writer in the UI. 'mock' keeps its name in the database (it is what the
-- hub and the reusable-kind filters already reference) and is labelled "Model
-- test" in the interface, which is what teachers here call it.
--
-- Drop and re-add rather than ALTER: the CHECK is cheap to rebuild and that is
-- the house rule set by 20260801092200_nexus_test_kind.sql.

ALTER TABLE nexus_tests DROP CONSTRAINT IF EXISTS nexus_tests_test_kind_check;

ALTER TABLE nexus_tests
  ADD CONSTRAINT nexus_tests_test_kind_check
  CHECK (test_kind IN (
    -- Short test a student must pass before a class starts.
    'class_prep',
    -- Whole-class test that clears a missed class off a catch-up backlog.
    'catchup_class',
    -- Teacher set it for the classroom. Mandatory, no gate.
    'classroom_assigned',
    -- Teacher offered it for optional practice.
    'practice_pool',
    -- A student built it for themselves from the question bank.
    'student_custom',
    -- Mirror of a study file / recap checkpoint / foundation section /
    -- module item quiz. Owned by that content, not editable as a test.
    'content_gate',
    -- Recurring test on the week's syllabus.
    'weekly',
    -- Model paper. Full-length rehearsal of the real exam.
    'mock',
    -- Full-syllabus test, longer than a model paper and used near the exam.
    'full',
    -- Everything from one chapter or topic.
    'chapter'
  ));

COMMENT ON COLUMN nexus_tests.test_kind IS
  'What this test is, stored rather than inferred from its placement. Drives grouping on both the teacher hub and the student list, and lets api/tests exclude gated kinds (class_prep, catchup_class) that must only ever be opened through their own route. weekly, mock, full and chapter are teacher-chosen labels for a classroom-assigned test and behave identically to classroom_assigned.';

-- The hub and the student list both filter on kind, and the existing index is
-- partial on is_active, which already covers these. No new index needed.
