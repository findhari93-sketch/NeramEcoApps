-- Academic batch registry: the exam-year cohort as a first-class, managed entity.
--
-- ================================ IMPORTANT ================================
-- This is the EXAM-YEAR COHORT (the academic year in which a student sits the
-- entrance exam, e.g. '2026-27'). It is tracked on users.academic_year (TEXT).
--
-- It is NOT the same as either existing "batch" concept:
--   * `batches` + student_profiles.batch_id  = a COURSE-CLASS schedule (Teams, capacity)
--   * `nexus_batches` + nexus_enrollments.batch_id = a SECTION inside a Nexus classroom
-- This registry NEVER uses a batch_id foreign key. users.academic_year (the
-- 'YYYY-YY' string) stays the sole join key; academic_batches.code is the string
-- business key that mirrors it. Do not add an FK from academic_year -> code
-- (academic_year must stay nullable and tolerate manual backfill).
-- ==========================================================================
--
-- Why a registry at all? users.academic_year already exists but is just a loose
-- string. This table gives each cohort an editable closing date (exam-board dates
-- aren't known up front), a lifecycle status, and exactly one "current" batch so
-- every user-list in admin + Nexus can default to the current cohort and offer a
-- batch selector for older ones.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS academic_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[0-9]{4}-[0-9]{2}$'), -- mirrors users.academic_year, e.g. '2026-27'
  label       TEXT,                                                       -- optional human label, e.g. 'NATA/JEE 2027'
  start_date  DATE,                                                       -- ~July 1 of the start year
  end_date    DATE,                                                       -- closing date; EDITABLE anytime by admin
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'active', 'closed')),
  is_current  BOOLEAN NOT NULL DEFAULT false,                            -- exactly one true; the default-view cohort
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id),
  updated_by  UUID REFERENCES users(id)
);

COMMENT ON TABLE academic_batches IS
  'Exam-year cohort registry (users.academic_year). NOT batches (course schedule) and NOT nexus_batches (classroom section). code mirrors users.academic_year; no FK by design.';
COMMENT ON COLUMN academic_batches.is_current IS
  'Exactly one batch is current. It is the cohort every admin/Nexus user-list defaults to; older batches are reachable via the batch selector.';
COMMENT ON COLUMN academic_batches.end_date IS
  'Closing date. Editable anytime because the exam board releases dates late; it does not auto-change status or auto-flip is_current.';

-- "Exactly one current" at the DB level (at-most-one). The app guarantees
-- at-least-one via the seed below + a getCurrentBatch() fallback chain. The
-- setCurrentBatch() query unsets others before setting the target, so this index
-- never sees two trues.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_academic_batches_current
  ON academic_batches (is_current) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_academic_batches_code ON academic_batches (code);

-- Read/write only via the service-role admin client (the API routes). No public policies.
ALTER TABLE academic_batches ENABLE ROW LEVEL SECURITY;

-- Seed the cohorts that already exist as users.academic_year values (from live
-- data), plus the incoming current batch. Dates follow the July 1 -> June 30
-- business cycle; admins can edit them later (especially end_date).
-- Idempotent: existing codes are left untouched.
INSERT INTO academic_batches (code, label, start_date, end_date, status, is_current) VALUES
  ('2024-25', 'NATA/JEE 2025', DATE '2024-07-01', DATE '2025-06-30', 'closed', false),
  ('2025-26', 'NATA/JEE 2026', DATE '2025-07-01', DATE '2026-06-30', 'active', false),
  ('2026-27', 'NATA/JEE 2027', DATE '2026-07-01', DATE '2027-06-30', 'open',   true),
  ('2027-28', 'NATA/JEE 2028', DATE '2027-07-01', DATE '2028-06-30', 'open',   false)
ON CONFLICT (code) DO NOTHING;
