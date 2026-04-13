-- College Hub: Student Saved Colleges
-- Allows logged-in students (Firebase auth) to bookmark colleges.
-- Persisted to DB so saves are available across devices and in the student app.

CREATE TABLE IF NOT EXISTS user_saved_colleges (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id  UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, college_id)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_colleges_user
  ON user_saved_colleges(user_id);

COMMENT ON TABLE user_saved_colleges IS
  'Colleges bookmarked by logged-in students. Managed via Firebase ID token auth.';
