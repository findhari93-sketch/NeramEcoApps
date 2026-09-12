-- ============================================
-- STUDENT SKETCHBOOK: practice rhythm, appreciation, class showcase
--
-- A sketch is a drawing_submissions row with source_type 'sketchbook', so the
-- existing reaction, comment, gallery and AI-evaluation machinery applies to it
-- without a second table. What is genuinely new lives in four small tables:
--   practice days   one row per student per IST calendar day with a sketch
--   flips           a teacher opened (seen) or passed over (skipped) a sketch
--   features        a teacher posted a sketch to a classroom, reversible
--   goal history    the weekly goal in force from a given Monday, so raising
--                   the goal never erases a run earned under the old one
--
-- Spec: docs/superpowers/specs/2026-09-11-student-sketchbook-design.md
-- Additive and idempotent.
-- ============================================

-- 1. 'sketchbook' joins the source_type CHECK (same dance as the exam migration).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drawing_submissions_source_type_check') THEN
    ALTER TABLE drawing_submissions DROP CONSTRAINT drawing_submissions_source_type_check;
  END IF;
END $$;

ALTER TABLE drawing_submissions
  ADD CONSTRAINT drawing_submissions_source_type_check
  CHECK (source_type IN ('question_bank', 'homework', 'free_practice', 'assignment', 'exam', 'sketchbook'));

-- 2. A 400px thumbnail beside the original, so grids never load full photos.
--    prompt_id is reserved for the phase 3 prompt bank; no FK until it exists.
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS prompt_id UUID;

CREATE INDEX IF NOT EXISTS idx_ds_sketchbook_student
  ON drawing_submissions(student_id, submitted_at DESC)
  WHERE source_type = 'sketchbook';

-- 3. Weekly goal per classroom, plus the history that makes it fair.
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS sketchbook_weekly_goal INTEGER NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nexus_classrooms_sketchbook_weekly_goal_check') THEN
    ALTER TABLE nexus_classrooms
      ADD CONSTRAINT nexus_classrooms_sketchbook_weekly_goal_check
      CHECK (sketchbook_weekly_goal BETWEEN 1 AND 7);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS nexus_sketchbook_goal_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id   UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  goal           INTEGER NOT NULL CHECK (goal BETWEEN 1 AND 7),
  effective_from DATE NOT NULL,
  set_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sketchbook_goal_history_classroom
  ON nexus_sketchbook_goal_history(classroom_id, effective_from DESC);

-- 4. A student may ask never to be featured.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sketchbook_feature_opt_out BOOLEAN NOT NULL DEFAULT false;

-- 5. Practice days. Maintained by the entries routes, never by trigger, so a
--    delete can repair the count with one query and the rhythm read stays
--    proportional to days rather than sketches.
CREATE TABLE IF NOT EXISTS nexus_sketchbook_practice_days (
  student_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practice_date       DATE NOT NULL,
  sketch_count        INTEGER NOT NULL DEFAULT 1,
  first_submission_id UUID REFERENCES drawing_submissions(id) ON DELETE SET NULL,
  PRIMARY KEY (student_id, practice_date)
);

-- 6. Flips: the online version of a teacher opening the physical sketchbook.
CREATE TABLE IF NOT EXISTS nexus_sketchbook_flips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN ('seen', 'skipped')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, submission_id)
);
CREATE INDEX IF NOT EXISTS idx_sketchbook_flips_submission
  ON nexus_sketchbook_flips(submission_id);

-- 7. Features: per classroom, reversible, remembering what was posted where so
--    un-featuring can soft-delete the Teams messages.
CREATE TABLE IF NOT EXISTS nexus_sketchbook_features (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id               UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  classroom_id                UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  featured_by                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption                     TEXT,
  teams_channel_id            TEXT,
  teams_channel_message_id    TEXT,
  teams_group_chat_message_id TEXT,
  card_hash                   TEXT,
  featured_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  unfeatured_at               TIMESTAMPTZ,
  UNIQUE (submission_id, classroom_id)
);
CREATE INDEX IF NOT EXISTS idx_sketchbook_features_live
  ON nexus_sketchbook_features(classroom_id, featured_at DESC)
  WHERE unfeatured_at IS NULL;

-- 8. Service role only, like the rest of the Nexus teacher surface. MSAL means
--    auth.uid() is always null here, so a policy would be dead code.
ALTER TABLE nexus_sketchbook_goal_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_sketchbook_practice_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_sketchbook_flips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_sketchbook_features      ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
