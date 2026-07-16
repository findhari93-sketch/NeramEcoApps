-- ============================================
-- NEXUS ASSIGNMENT TYPES (drawing vs document)
-- Makes an assignment type-aware so each kind routes to the right machinery:
--   'drawing'  -> a photos-only sketch/drawing task that plugs into the existing
--                 Drawing Review channel (region markup, sketch-over, corrected
--                 reference, 1-5 rating, redo threads, gallery, points) via a
--                 backing drawing_questions row.
--   'document' -> the existing "solve a paper" flow (attach a PDF the student
--                 works from, upload/pick/link, then simple marks review).
--
-- Also lets a study file be an external LINK (paste a OneDrive/SharePoint share
-- URL) instead of re-uploaded bytes, so a JEE PYQ already in OneDrive can be
-- attached without duplicating it.
--
-- Additive + idempotent (columns + widened checks only, no new tables).
-- ============================================

-- 1. Assignment type + backing drawing question on nexus_class_assignments.
--    Existing rows default to 'document' (matches today's upload + marks behavior).
--    drawing_question_id is set for drawing-type assignments; it points at an
--    is_active=false drawing_questions row that carries the prompt + reference
--    image and unlocks the drawing channel's thread/redo/gallery/queue for free.
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'document';
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS drawing_question_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_class_assignments_assignment_type_check'
      AND conrelid = 'nexus_class_assignments'::regclass
  ) THEN
    ALTER TABLE nexus_class_assignments
      ADD CONSTRAINT nexus_class_assignments_assignment_type_check
      CHECK (assignment_type IN ('drawing', 'document'));
  END IF;

  -- FK is added only when the drawing_questions table exists (it does in Nexus).
  IF to_regclass('public.drawing_questions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'nexus_class_assignments_drawing_question_id_fkey'
         AND conrelid = 'nexus_class_assignments'::regclass
     ) THEN
    ALTER TABLE nexus_class_assignments
      ADD CONSTRAINT nexus_class_assignments_drawing_question_id_fkey
      FOREIGN KEY (drawing_question_id) REFERENCES drawing_questions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nca_drawing_question
  ON nexus_class_assignments(drawing_question_id) WHERE drawing_question_id IS NOT NULL;

-- 2. Link a drawing submission back to its assignment + allow source_type='assignment'.
--    assignment_id is the direct back-link the Assignments space uses to federate
--    over drawing submissions (the forward link is drawing_question_id above).
DO $$
BEGIN
  IF to_regclass('public.drawing_submissions') IS NOT NULL THEN
    -- Back-link column + FK.
    ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS assignment_id UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'drawing_submissions_assignment_id_fkey'
        AND conrelid = 'drawing_submissions'::regclass
    ) THEN
      ALTER TABLE drawing_submissions
        ADD CONSTRAINT drawing_submissions_assignment_id_fkey
        FOREIGN KEY (assignment_id) REFERENCES nexus_class_assignments(id) ON DELETE CASCADE;
    END IF;

    -- Widen source_type to include 'assignment' (was question_bank|homework|free_practice).
    ALTER TABLE drawing_submissions
      DROP CONSTRAINT IF EXISTS drawing_submissions_source_type_check;
    ALTER TABLE drawing_submissions
      ADD CONSTRAINT drawing_submissions_source_type_check
      CHECK (source_type IN ('question_bank', 'homework', 'free_practice', 'assignment'));

    CREATE INDEX IF NOT EXISTS idx_ds_assignment
      ON drawing_submissions(assignment_id) WHERE assignment_id IS NOT NULL;
  END IF;
END $$;

-- 3. Let a study file be an external LINK instead of uploaded bytes.
--    When link_url is set, the file has no storage/single-site item to stream;
--    the content route resolves it via getSharePointStreamUrl(link_url), which
--    handles sharing links / stream.aspx / webUrls across any site/drive.
DO $$
BEGIN
  IF to_regclass('public.nexus_study_files') IS NOT NULL THEN
    ALTER TABLE nexus_study_files ADD COLUMN IF NOT EXISTS link_url TEXT;
  END IF;
END $$;
