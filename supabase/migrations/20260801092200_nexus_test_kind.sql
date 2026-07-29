-- ============================================
-- TEST TAXONOMY: nexus_tests.test_kind
--
-- What a test IS, stored once, instead of guessed twice.
--
-- Today the answer is inferred at read time in two places that do not agree:
--   * listTestsGroupedByContext() infers a bucket from the primary placement's
--     context, falling back to classroom_id, then to "practice". catchup_class
--     and student_practice match no branch, so every catch-up test is currently
--     labelled a "Classroom test".
--   * the student page infers its own three groups client-side from is_custom
--     plus the placement context.
-- Two unrelated derivations of the same idea is the argument for storing it.
--
-- It also closes a live leak. api/tests returns every published, non-custom row
-- for a classroom, and buildClassTestFromRecap sets classroom_id + is_published,
-- so every catch-up class test currently appears in every student's "Assigned by
-- your teacher" list and can be opened through the legacy engine, which never
-- checks test_unlocked_at. A stored kind lets that route exclude them.
--
-- TEXT + CHECK rather than an enum, matching nexus_class_absences.kind and
-- nexus_class_assignments.timing: 'weekly' and 'mock' are reserved for tests we
-- have not designed yet, and widening a CHECK is a cheap drop and re-add while
-- widening an enum costs a dedicated migration file per value.
-- ============================================

-- 1. The column ---------------------------------------------------------------

-- DEFAULT 'classroom_assigned' is load-bearing, not cosmetic. POST /api/tests
-- inserts into nexus_tests directly and always sets classroom_id, so the default
-- preserves that writer's exact current meaning with no change to it.
ALTER TABLE nexus_tests
  ADD COLUMN IF NOT EXISTS test_kind TEXT NOT NULL DEFAULT 'classroom_assigned';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_tests_test_kind_check'
      AND conrelid = 'nexus_tests'::regclass
  ) THEN
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
        -- Reserved. No writer yet, deliberately: see the header.
        'weekly',
        'mock'
      ));
  END IF;
END $$;

COMMENT ON COLUMN nexus_tests.test_kind IS
  'What this test is, stored rather than inferred from its placement. Drives grouping on both the teacher hub and the student list, and lets api/tests exclude gated kinds (class_prep, catchup_class) that must only ever be opened through their own route.';

-- 2. Backfill, most specific classification first -----------------------------

-- Order matters. Each UPDATE excludes rows a previous one already claimed, so a
-- later, broader rule cannot overwrite a better answer. Written as explicit
-- guards rather than relying on statement order alone, because this file may be
-- re-run against a partially migrated database.

-- 2a. Student-built. is_custom is unambiguous and set by exactly one writer.
UPDATE nexus_tests
   SET test_kind = 'student_custom'
 WHERE is_custom = true;

-- 2b. Content mirrors. Either the reversibility stamp or a placement into one of
-- the four content contexts. Both, because the live mirrors written by
-- upsertTestWithQuestions and replaceRecapSections carry an *_authored stamp
-- while the one-time backfills carry *_migration.
UPDATE nexus_tests t
   SET test_kind = 'content_gate'
 WHERE COALESCE(t.is_custom, false) = false
   AND (
     t.created_from IN (
       'study_migration', 'study_authored',
       'recap_migration', 'recap_authored',
       'foundation_migration', 'module_migration'
     )
     OR EXISTS (
       SELECT 1 FROM nexus_test_placements p
        WHERE p.test_id = t.id
          AND p.is_active = true
          AND p.context_type IN ('study_file', 'class_recap_section', 'foundation_section', 'module_item')
     )
   );

-- 2c. Catch-up class tests. These are the rows currently mislabelled as
-- classroom tests on the teacher hub and leaking into the student list.
UPDATE nexus_tests t
   SET test_kind = 'catchup_class'
 WHERE t.test_kind = 'classroom_assigned'
   AND (
     t.created_from = 'catchup_class'
     OR EXISTS (
       SELECT 1 FROM nexus_test_placements p
        WHERE p.test_id = t.id
          AND p.is_active = true
          AND p.context_type = 'catchup_class'
     )
   );

-- 2d. Teacher-offered optional practice. Only rows whose ONLY active placements
-- are student_practice: a test placed both as a classroom assignment and as
-- practice is mandatory, and must stay classroom_assigned.
UPDATE nexus_tests t
   SET test_kind = 'practice_pool'
 WHERE t.test_kind = 'classroom_assigned'
   AND EXISTS (
     SELECT 1 FROM nexus_test_placements p
      WHERE p.test_id = t.id AND p.is_active = true AND p.context_type = 'student_practice'
   )
   AND NOT EXISTS (
     SELECT 1 FROM nexus_test_placements p
      WHERE p.test_id = t.id AND p.is_active = true AND p.context_type <> 'student_practice'
   );

-- 2e. Everything left keeps the column default: a classroom_assignment
-- placement, or a legacy row with classroom_id and no placement at all.

-- 3. The grouping read --------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_nexus_tests_kind
  ON nexus_tests(test_kind) WHERE is_active = true;

NOTIFY pgrst, 'reload schema';
