-- ============================================================================
-- A SEVENTH REASON: "I DID NOT KNOW THE TEST WAS OPEN"
--
-- Why. Twenty students did not sit the 18 Aug History of Architecture exam.
-- Four were blocked by a submit bug, one was unwell, five had joined after it,
-- and ten were in the class and never opened it. Seventeen of the twenty-six
-- reopened students never opened the bell notice either. The answer the founder
-- most needed ("did they even know it was open") was the one the vocabulary
-- could not hold.
--
-- The vocabulary lives in apps/nexus/src/lib/test-reasons.ts, and the header of
-- 20260824090100_nexus_test_reasons.sql asks that BOTH CHECK constraints are
-- widened together with that array. So both are, even though the app only
-- offers did_not_know for a test the student never sat (a sitting somebody
-- started is one they knew was open, and the reasons route refuses it there).
-- One list in two places, never two dialects.
--
-- Idempotent: each constraint is dropped if present and re-added with the full
-- list, so running this twice ends in the same state.
-- ============================================================================

-- 1. Tests a student did not sit (the "Tell your teacher why" sheet) ----------
-- The original constraint was declared inline, so Postgres named it
-- nexus_test_skip_reasons_reason_code_check (checked on production 2026-09-17).
ALTER TABLE public.nexus_test_skip_reasons
  DROP CONSTRAINT IF EXISTS nexus_test_skip_reasons_reason_code_check;

ALTER TABLE public.nexus_test_skip_reasons
  ADD CONSTRAINT nexus_test_skip_reasons_reason_code_check
  CHECK (reason_code IN (
    'technical_problem', 'too_hard', 'not_understood', 'no_time', 'unwell', 'other', 'did_not_know'
  ));

-- 2. Abandoned sittings, kept in step with the list above -------------------
ALTER TABLE public.nexus_test_attempts
  DROP CONSTRAINT IF EXISTS nexus_test_attempts_abandon_reason_code_check;

ALTER TABLE public.nexus_test_attempts
  ADD CONSTRAINT nexus_test_attempts_abandon_reason_code_check
  CHECK (abandon_reason_code IS NULL OR abandon_reason_code IN (
    'technical_problem', 'too_hard', 'not_understood', 'no_time', 'unwell', 'other', 'did_not_know'
  ));

COMMENT ON COLUMN public.nexus_test_skip_reasons.reason_code IS
  'Why the student did not sit this test, from the fixed list in apps/nexus/src/lib/test-reasons.ts. did_not_know (added by 20260923090100) is offered only here, never for an abandoned sitting.';

NOTIFY pgrst, 'reload schema';
