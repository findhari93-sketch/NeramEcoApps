-- ============================================================================
-- EXAM TIMER MODE: the scheduled sitting's own clock, independent of the paper
--
-- Until now the student's countdown always came from the PAPER's own
-- test_type/duration_minutes (nexus_tests), fixed once at authoring time in
-- the wizard's "Timed" toggle. nexus_exams.duration_minutes already existed
-- but had no effect on the timer a student actually saw -- it was read only
-- by the Teams announcement and (incorrectly) by the invigilation roster's own
-- countdown. A teacher who typed "30" into Minutes allowed and watched the
-- exam still open Untimed had no way to tell the two apart.
--
-- timer_mode makes the exam's own choice explicit rather than inferring it
-- from a nullable duration_minutes, which cannot distinguish "not specified,
-- inherit the paper" from "explicitly untimed":
--   - inherit (the default, and what every pre-existing row is): the
--     student's clock is resolved from the paper's own
--     test_type/duration_minutes, byte-identical to today. No exam scheduled
--     before this ships changes behavior.
--   - timed: THIS exam's own duration_minutes is authoritative, regardless of
--     what the paper says.
--   - untimed: no countdown is shown, regardless of what the paper says.
--
-- resolveExamTimer() in exam-timer.ts is the one place this is decided; every
-- reader of an exam sitting's timer goes through it.
-- ============================================================================
ALTER TABLE nexus_exams
  ADD COLUMN IF NOT EXISTS timer_mode TEXT NOT NULL DEFAULT 'inherit';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_exams_timer_mode_check'
      AND conrelid = 'nexus_exams'::regclass
  ) THEN
    ALTER TABLE nexus_exams
      ADD CONSTRAINT nexus_exams_timer_mode_check CHECK (timer_mode IN ('inherit', 'untimed', 'timed'));
  END IF;
END $$;

COMMENT ON COLUMN nexus_exams.timer_mode IS
  'inherit (the default, and what every pre-existing row is): the student clock comes from the paper''s own test_type/duration_minutes, unchanged. untimed: no countdown regardless of the paper. timed: this exam''s own duration_minutes is authoritative. See resolveExamTimer() in exam-timer.ts, the one place this is read.';

NOTIFY pgrst, 'reload schema';
