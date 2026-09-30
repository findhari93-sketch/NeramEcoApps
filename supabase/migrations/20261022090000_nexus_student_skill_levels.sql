-- ============================================================
-- Student levels: a teacher's judgement of how ready a student is
-- ============================================================
--
-- One row per student per skill: Top, Mid or Needs practice. Drawing is the
-- only skill set today; aptitude and maths join by widening the skill CHECK
-- once Neram tests measure them reliably. The avatar shows the OVERALL level,
-- which the app derives from these rows (lib/student-level.ts), and a tap on
-- the face opens the per-skill breakdown.
--
-- The level belongs to the STUDENT, not to a classroom. Classrooms are created
-- per academic year, and a student moving into next year's classroom has not
-- lost their drawing ability.
--
-- STAFF ONLY. A level is never shown to a student or a parent, so it lives in
-- its own tables rather than on nexus_enrollments (students can read their own
-- enrolment row). Only the Nexus API routes read or write these, through the
-- service role: RLS on with no policies, and anon and authenticated lose every
-- privilege explicitly, because Supabase grants table privileges to both roles
-- directly and REVOKE FROM PUBLIC alone would leave them in.

CREATE TABLE IF NOT EXISTS nexus_student_skill_levels (
  student_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill      text        NOT NULL CHECK (skill IN ('drawing')),
  level      text        NOT NULL CHECK (level IN ('top', 'mid', 'needs_practice')),
  note       text        CHECK (note IS NULL OR char_length(note) <= 280),
  set_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  set_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, skill)
);

COMMENT ON TABLE nexus_student_skill_levels IS
  'Current level per student per skill (Top / Mid / Needs practice), set by managers. Drawing only for now. Never shown to students or parents. Service role only.';

-- Append-only history, so the team can see who moved a student and when, and
-- count how many moved up this month.
CREATE TABLE IF NOT EXISTS nexus_student_skill_level_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill        text        NOT NULL CHECK (skill IN ('drawing')),
  from_level   text        CHECK (from_level IN ('top', 'mid', 'needs_practice')),
  -- NULL means the level was cleared back to "Not rated".
  to_level     text        CHECK (to_level IN ('top', 'mid', 'needs_practice')),
  note         text,
  source       text        NOT NULL CHECK (source IN ('sort', 'flip', 'snapshot', 'profile')),
  performed_by uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_student_skill_level_events_student
  ON nexus_student_skill_level_events (student_id, created_at DESC);

COMMENT ON TABLE nexus_student_skill_level_events IS
  'Every change to nexus_student_skill_levels, with who made it and from which screen. Append-only. Service role only.';

ALTER TABLE nexus_student_skill_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_skill_level_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE nexus_student_skill_levels FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE nexus_student_skill_level_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE nexus_student_skill_levels TO service_role;
GRANT ALL ON TABLE nexus_student_skill_level_events TO service_role;
