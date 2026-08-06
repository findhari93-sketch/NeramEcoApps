-- ============================================================================
-- WHY A STUDENT DID NOT DO, OR COULD NOT FINISH, A TEST
--
-- Two storage sites for one vocabulary, because the two facts have different
-- lifetimes and different owners.
--
--   nexus_test_attempts.abandon_reason_*   "I started and stopped."
--                                          Belongs to the SITTING. A student may
--                                          abandon the same paper three times
--                                          for three different reasons, and each
--                                          belongs to its own attempt row.
--
--   nexus_test_skip_reasons                "I am not going to do this."
--                                          Belongs to the STUDENT and the TEST.
--                                          There is no attempt to hang it on,
--                                          which is exactly why it needs a table.
--
-- WHY THIS EXISTS. On 2026-08-06 the teacher hub showed 19 student-built papers,
-- 9 of which had been opened and abandoned with no submission at all, one of
-- them nine separate times. The screen rendered every one of those as
-- "0 attempts", which reads as a student who never bothered. Nothing in the
-- database could distinguish:
--
--     the paper is broken        (staff must fix it, today)
--     the paper is too hard      (staff should teach into it)
--     the student ran out of time (staff should do nothing)
--
-- Three different problems, one wrong number. These columns are how the student
-- gets to say which one it was.
--
-- The reason vocabulary lives in apps/nexus/src/lib/test-reasons.ts and is
-- pinned by unit tests. To add a code, widen BOTH that array and the two CHECK
-- constraints below. Deliberately a THIRD vocabulary alongside RSVP and prework:
-- neither of those can express 'technical_problem' or 'too_hard', which are the
-- two answers this whole feature exists to collect.
-- ============================================================================

-- 1. Abandoned sittings ------------------------------------------------------
-- Nullable and always will be. navigator.sendBeacon fires on page unload, where
-- there is no UI and no chance to ask anything, so the attempt is marked
-- abandoned first and the reason is collected later, the next time the student
-- opens Tests. A row with an abandon but no reason is the normal intermediate
-- state, not a defect, and the 19 attempts already abandoned in production will
-- never have one.

ALTER TABLE nexus_test_attempts
  ADD COLUMN IF NOT EXISTS abandon_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS abandon_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS abandon_reason_at   TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_test_attempts_abandon_reason_code_check'
      AND conrelid = 'nexus_test_attempts'::regclass
  ) THEN
    ALTER TABLE nexus_test_attempts
      ADD CONSTRAINT nexus_test_attempts_abandon_reason_code_check
      CHECK (abandon_reason_code IS NULL OR abandon_reason_code IN (
        'technical_problem', 'too_hard', 'not_understood', 'no_time', 'unwell', 'other'
      ));
  END IF;
END $$;

COMMENT ON COLUMN nexus_test_attempts.abandon_reason_code IS
  'Why this sitting was abandoned, in the student''s own words from a fixed list. NULL means nobody has asked yet OR the student declined to say, which are deliberately not distinguished: pressing a student twice for an answer they already skipped is worse than the missing datum. Vocabulary: apps/nexus/src/lib/test-reasons.ts.';

COMMENT ON COLUMN nexus_test_attempts.abandon_reason_note IS
  'Free text. REQUIRED by the client for technical_problem and other. "Something went wrong" is unactionable; "question 12 never loaded" is a bug report, and that difference is the point of collecting this at all.';

-- The teacher read is "unfinished sittings on this test, with reasons", so the
-- index matches that rather than indexing the reason column on its own.
CREATE INDEX IF NOT EXISTS idx_test_attempts_abandon_reason
  ON nexus_test_attempts (test_id, abandon_reason_code)
  WHERE abandon_reason_code IS NOT NULL;

-- 2. Tests a student is not going to sit --------------------------------------

CREATE TABLE IF NOT EXISTS public.nexus_test_skip_reasons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  test_id      UUID NOT NULL REFERENCES public.nexus_tests(id) ON DELETE CASCADE,
  -- An assigned test is sat THROUGH a placement, and the same paper can be
  -- placed in two contexts with two deadlines. A reason given for one placement
  -- says nothing about the other, so the placement is part of the identity.
  -- NULL means the student's own paper, which has no placement at all.
  placement_id UUID REFERENCES public.nexus_test_placements(id) ON DELETE CASCADE,
  -- Denormalised for the same reason nexus_class_prep_state.classroom_id is: the
  -- teacher's "who in my classroom is skipping work" read must not join through
  -- placements on every dashboard load.
  classroom_id UUID REFERENCES public.nexus_classrooms(id) ON DELETE SET NULL,

  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'technical_problem', 'too_hard', 'not_understood', 'no_time', 'unwell', 'other'
  )),
  reason_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ONE reason per student per test per placement, updated rather than duplicated.
--
-- TWO partial indexes rather than one plain unique, and this is not a style
-- choice. Postgres treats NULLs as distinct in a unique index, so a single
-- UNIQUE (student_id, test_id, placement_id) would happily accept fifty rows for
-- the same student's own paper, because placement_id is NULL on every one of
-- them and NULL <> NULL. This codebase has already been bitten by a
-- placement-uniqueness subtlety once (see 20260713190000), so it is spelled out.
CREATE UNIQUE INDEX IF NOT EXISTS uq_test_skip_reason_placed
  ON public.nexus_test_skip_reasons (student_id, test_id, placement_id)
  WHERE placement_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_test_skip_reason_unplaced
  ON public.nexus_test_skip_reasons (student_id, test_id)
  WHERE placement_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_test_skip_reasons_test
  ON public.nexus_test_skip_reasons (test_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_skip_reasons_classroom
  ON public.nexus_test_skip_reasons (classroom_id, created_at DESC)
  WHERE classroom_id IS NOT NULL;

COMMENT ON TABLE public.nexus_test_skip_reasons IS
  'Why a student is not going to sit a test they were given. One row per (student, test, placement), updated in place. Distinct from nexus_test_attempts.abandon_reason_*, which records why a sitting that STARTED was stopped. A skip reason is NOT an excusal and NOT a deadline extension: the door stays open and the test stays due, exactly as with the class prep gate. It exists so a teacher knows why before the deadline instead of guessing after it.';

COMMENT ON COLUMN public.nexus_test_skip_reasons.placement_id IS
  'Which placement this refusal is about. NULL for a student''s own paper, which has no placement. Part of the row identity: see the two partial unique indexes, which exist because NULL <> NULL would let a plain unique constraint accept unlimited duplicates.';

-- Service-role only, matching nexus_enrollment_classification_events and
-- nexus_class_prep_state. Every read and write goes through a route that has
-- already resolved the caller, so RLS on with no policy is default deny.
ALTER TABLE public.nexus_test_skip_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.nexus_test_skip_reasons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
