-- Student program split: separate the "software course" students from architecture aspirants.
--
-- The admin /alumni Students list mixes two very different groups under one roof
-- (users where is_alumni = false AND user_type = 'student'):
--   1. Architecture exam aspirants (NATA / JEE Paper 2) — the core audience the
--      Students list, academic-year tagging and graduation flow are built for.
--   2. Software-course students — a separate program (college students already in
--      architecture, some graduated and working). They are NOT exam aspirants and
--      pollute the Students count and the "No academic year" / "Inactive" tiles.
--
-- This flag lets an admin move the software-course folks to a dedicated /software
-- page, keeping the Students list clean. It does NOT add a new Nexus gate: software
-- students are already locked out by the existing nexus_access_enabled gate
-- (20260628150000), which is closed to all students by default during the 2026-27
-- rebuild. The admin move action additionally re-asserts nexus_access_enabled = false.
--
-- Idempotent: safe to run more than once. DEFAULT 'architecture' backfills every
-- existing row, so the current Students list is unchanged until an admin moves people.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS student_program TEXT NOT NULL DEFAULT 'architecture'
  CHECK (student_program IN ('architecture', 'software'));

COMMENT ON COLUMN users.student_program IS
  'Which Neram program the student belongs to. ''architecture'' = NATA/JEE exam aspirants (the core Students list); ''software'' = the separate software course (college/working architects), shown on the admin /software page and kept out of Nexus.';

-- Partial index: software students are a small subset, queried for the /software page.
CREATE INDEX IF NOT EXISTS idx_users_student_program
  ON users(student_program) WHERE student_program = 'software';
