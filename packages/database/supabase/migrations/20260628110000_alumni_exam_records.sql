-- Alumni exam records: which entrance exams a graduated student attempted, and how many times.
--
-- Staff phone graduated students to collect entrance-exam documents (most never uploaded a
-- scorecard). To drive the upload UI we record, per alumnus, which exams were attempted and how
-- many attempts each had. Each attempt then exposes an admit-card slot and a scorecard slot.
--
--   - attempted_nata / attempted_jee: did the student sit this exam at all.
--   - nata_attempt_count / jee_attempt_count: how many attempts (NATA up to 3, JEE up to 2). The
--     UI shows one admit-card + scorecard slot per attempt.
--
-- The exam files themselves live in student_documents (no schema change there); they are tagged
-- by a category slug like exam_nata_admit_1 / exam_nata_score_2 / exam_jee_admit_1, and custom
-- documents use category exam_custom with a free-text title.
--
-- Idempotent.

ALTER TABLE alumni_profiles
  ADD COLUMN IF NOT EXISTS attempted_nata     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempted_jee      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nata_attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS jee_attempt_count  INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN alumni_profiles.attempted_nata IS 'Did this alumnus attempt NATA at least once.';
COMMENT ON COLUMN alumni_profiles.attempted_jee IS 'Did this alumnus attempt JEE (Main Paper 2) at least once.';
COMMENT ON COLUMN alumni_profiles.nata_attempt_count IS 'Number of NATA attempts (1-3); one admit-card + scorecard slot per attempt.';
COMMENT ON COLUMN alumni_profiles.jee_attempt_count IS 'Number of JEE attempts (1-2); one admit-card + scorecard slot per attempt.';
