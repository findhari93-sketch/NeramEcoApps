-- Alumni directory profile (Phase 2a).
--
-- A 1:1 companion to a graduated student's `users` row, holding the alumni-only
-- fields that let Neram stay in touch over the years: the college + course they
-- joined after Neram, social links, and curation flags. Kept out of `users` so the
-- core identity table stays lean and these only exist for alumni.
--
-- Identity/batch stay on `users` (name, email, avatar_url, academic_year cohort,
-- is_alumni, alumni_since). Year-of-study and "Graduate Architect" are derived on
-- read from college_start_year / expected_graduation_year (no stored state).
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS alumni_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  college_id              UUID REFERENCES colleges(id) ON DELETE SET NULL,
  college_name            TEXT,                                  -- free-text fallback when the college is not in the catalog
  course_branch           TEXT NOT NULL DEFAULT 'Architecture (B.Arch)',
  college_start_year      INTEGER,
  expected_graduation_year INTEGER,
  college_status          TEXT CHECK (college_status IN ('counseling','studying','graduated')),
  linkedin_url            TEXT,
  instagram_url           TEXT,
  portfolio_url           TEXT,
  other_links             JSONB,
  bio                     TEXT,
  is_verified             BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by              UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_alumni_profiles_college_id ON alumni_profiles(college_id);

COMMENT ON TABLE alumni_profiles IS 'Alumni-only directory fields (college, course, social links, bio) 1:1 with a graduated users row. Identity/batch live on users.';
COMMENT ON COLUMN alumni_profiles.college_name IS 'Free-text college name fallback when college_id is not set (college not in the catalog).';
COMMENT ON COLUMN alumni_profiles.course_branch IS 'Course the alumnus joined after Neram. Defaults to Architecture (B.Arch); editable to other courses.';
