-- ============================================================================
-- A grade for each practice drawing, and one "evaluated" fact every reader uses.
--
-- WHY THIS EXISTS. Flip through let a teacher react to a sketch but not say how
-- good it was. The "Drawing: Mid" chip on the card is the student's overall
-- level (one per student, managers only), not a verdict on this sheet. A teacher
-- now grades each practice drawing Top, Mid or Needs practice, and the student
-- sees it.
--
-- WHAT "EVALUATED" MEANS. A practice drawing is evaluated once it has a grade
-- AND a reaction; the comment is optional. The server sets evaluated_at the
-- first time both are present and clears it if either is cleared. The flip
-- through list and the nav badge read evaluated_at alone, so they never disagree.
--
-- THE BACKFILL. Everything a teacher already answered (a reaction or a finished
-- review) stays answered, so old sketches do not come back as "Needs grade".
--
-- Written to re-run safely, because `supabase db push` replays anything missing
-- from schema_migrations.
-- ============================================================================

ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS drawing_grade TEXT;
ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
-- graded_by is a plain uuid on purpose, NOT a foreign key to users. A second FK
-- from drawing_submissions to users makes every unhinted `student:users(...)`
-- embed fail ("more than one relationship was found"), which took the flip
-- through inbox down on staging the moment this first ran with the FK.
ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS graded_by UUID;
ALTER TABLE drawing_submissions DROP CONSTRAINT IF EXISTS drawing_submissions_graded_by_fkey;
ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE drawing_submissions
    ADD CONSTRAINT drawing_submissions_drawing_grade_check
    CHECK (drawing_grade IS NULL OR drawing_grade IN ('top', 'mid', 'needs_practice'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE drawing_submissions
   SET evaluated_at = COALESCE(reviewed_at, now())
 WHERE evaluated_at IS NULL
   AND assignment_id IS NULL
   AND (reaction IS NOT NULL OR reviewed_at IS NOT NULL);

-- The flip through list: newest unevaluated practice drawings first.
CREATE INDEX IF NOT EXISTS drawing_submissions_unevaluated_idx
  ON drawing_submissions (submitted_at DESC)
  WHERE evaluated_at IS NULL AND assignment_id IS NULL;

COMMENT ON COLUMN drawing_submissions.drawing_grade IS 'Teacher grade for this practice drawing: top, mid or needs_practice. Shown to the student.';
COMMENT ON COLUMN drawing_submissions.evaluated_at IS 'Set when a practice drawing has both a grade and a reaction (or was answered before grades existed).';

NOTIFY pgrst, 'reload schema';
