-- Alumni Hall of Fame: achievement + showcase flag (Phase 2).
--
-- The student-facing "Hall of Fame" in Nexus inspires current students with their
-- seniors. Until now it could only surface alumni *drawings*
-- (drawing_submissions.alumni_featured). But some inspiring seniors have a standout
-- result or college yet never submitted a drawing, and some have great drawings with
-- no notable result. So achievement lives at the alumnus level (all optional here) and
-- is independent of their drawings:
--   - is_hall_of_fame: showcase this senior to current students, even with no drawings.
--   - exam_name / exam_result / achievement_note: the inspiring result, free-text so it
--     fits any exam (NATA rank, JEE percentile, and so on). The college they joined
--     already lives in college_id / college_name.
--
-- Idempotent.

ALTER TABLE alumni_profiles
  ADD COLUMN IF NOT EXISTS is_hall_of_fame  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exam_name        TEXT,
  ADD COLUMN IF NOT EXISTS exam_result      TEXT,
  ADD COLUMN IF NOT EXISTS achievement_note TEXT;

-- Partial index: the Nexus showcase reads only showcased seniors.
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_hall_of_fame
  ON alumni_profiles(is_hall_of_fame) WHERE is_hall_of_fame;

COMMENT ON COLUMN alumni_profiles.is_hall_of_fame IS 'Showcase this alumnus in the student Hall of Fame (Nexus), independent of whether they have featured drawings.';
COMMENT ON COLUMN alumni_profiles.exam_name IS 'Inspiring exam result label, e.g. "NATA 2025" or "JEE Main Paper 2".';
COMMENT ON COLUMN alumni_profiles.exam_result IS 'Free-text result to fit any exam: "AIR 142", "98.2 percentile", "Rank 142".';
COMMENT ON COLUMN alumni_profiles.achievement_note IS 'Short inspirational blurb shown on the Hall of Fame card.';
