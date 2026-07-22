-- ============================================
-- NEXUS ASSIGNMENT EVALUATION TYPES + encouraging reaction
-- Lets a teacher pick the grading scale per assignment (and change it):
--   'marks' -> a numeric mark out of max_marks (default 10, or 100, or any value)
--   'stars' -> a 1-5 star rating with no number shown to the student
-- The choice applies to BOTH assignment kinds. Documents reuse the existing
-- nexus_assignment_submissions.marks column for both scales (stars store 1-5 with
-- max_marks pinned to 5, rendered as stars). Drawings already grade on a 1-5 star
-- tutor_rating; they gain a tutor_marks column so the marks scale has somewhere to
-- land without colliding with the 1-5 CHECK on tutor_rating.
--
-- Also adds a nullable `reaction` (one of the existing 5 gallery emojis) on each
-- submission table so the teacher can send an appreciation while grading.
--
-- Additive + idempotent (columns + one backfill UPDATE, no new tables).
-- ============================================

-- 1. Evaluation scale on the assignment. Existing rows default to 'marks'
--    (matches today's numeric-marks document behavior).
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS evaluation_type TEXT NOT NULL DEFAULT 'marks';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_class_assignments_evaluation_type_check'
      AND conrelid = 'nexus_class_assignments'::regclass
  ) THEN
    ALTER TABLE nexus_class_assignments
      ADD CONSTRAINT nexus_class_assignments_evaluation_type_check
      CHECK (evaluation_type IN ('marks', 'stars'));
  END IF;
END $$;

-- 2. Teacher appreciation reaction on the document submission (reuses the 5-emoji
--    vocabulary already used by drawing_gallery_reactions).
DO $$
BEGIN
  IF to_regclass('public.nexus_assignment_submissions') IS NOT NULL THEN
    ALTER TABLE nexus_assignment_submissions ADD COLUMN IF NOT EXISTS reaction TEXT;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'nexus_assignment_submissions_reaction_check'
        AND conrelid = 'nexus_assignment_submissions'::regclass
    ) THEN
      ALTER TABLE nexus_assignment_submissions
        ADD CONSTRAINT nexus_assignment_submissions_reaction_check
        CHECK (reaction IS NULL OR reaction IN ('heart', 'clap', 'fire', 'star', 'wow'));
    END IF;
  END IF;
END $$;

-- 3. Drawing marks scale + the same appreciation reaction on drawing submissions.
--    tutor_marks holds the numeric grade when the parent assignment uses 'marks';
--    tutor_rating (1-5) stays the store for the 'stars' scale.
DO $$
BEGIN
  IF to_regclass('public.drawing_submissions') IS NOT NULL THEN
    ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS tutor_marks NUMERIC(6,2);
    ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS reaction TEXT;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'drawing_submissions_reaction_check'
        AND conrelid = 'drawing_submissions'::regclass
    ) THEN
      ALTER TABLE drawing_submissions
        ADD CONSTRAINT drawing_submissions_reaction_check
        CHECK (reaction IS NULL OR reaction IN ('heart', 'clap', 'fire', 'star', 'wow'));
    END IF;
  END IF;
END $$;

-- 4. Backfill: existing drawing assignments were graded on the 1-5 star scale,
--    so pin them to 'stars' (and max_marks = 5). Documents keep the 'marks'
--    default and their current max_marks. This is the requested backfill for the
--    current assignments.
UPDATE nexus_class_assignments
  SET evaluation_type = 'stars', max_marks = 5
  WHERE assignment_type = 'drawing';
