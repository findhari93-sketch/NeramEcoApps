-- ============================================
-- SCHEDULE TERMS: THE TEACHING DAY CHANGES SHAPE DURING THE YEAR
--
-- Neram runs two seasons that look nothing alike:
--
--   Regular      school students are only free in the evening, so one class a
--                day, 7 to 8 PM, roughly June to March.
--   Crash course after the board exams finish, students are free all day, so
--                classes run morning AND evening on a different course plan.
--
-- The changeover date is not knowable in advance: it depends on when the board
-- exams actually end that year. So the shape of the day has to be DATA, set per
-- academic year, not a constant in the code or a single global setting.
--
-- Scoped to the classroom, which is already one per academic year (see the
-- classroom-per-year rollup), so "terms for 2026-27" needs no separate concept.
--
-- Replaces the single `nexus_settings.timetable_window` row as the source of
-- truth for class hours. That setting stays as the fallback for a classroom
-- with no terms defined, so nothing breaks before terms are set up.
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_schedule_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'crash')),
  -- Both bounds inclusive. Terms must not overlap within a classroom; that is
  -- enforced in the API layer (see lib/schedule-terms.ts findOverlap) so the
  -- error can name the term that is in the way instead of surfacing a
  -- constraint violation.
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  -- [{ start: 'HH:MM', end: 'HH:MM', label?: string }]
  -- An array, not a single start/end, because the crash course runs morning and
  -- evening with a long gap: two bands let the calendar collapse the dead
  -- afternoon instead of drawing six empty hours.
  bands JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- ISO weekdays, 1 = Monday. Crash terms often add Sunday.
  days SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  -- The teaching plan active during this term. SET NULL, not CASCADE: deleting
  -- a plan must not delete the season it belonged to.
  plan_id UUID REFERENCES nexus_teaching_plans(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nexus_schedule_terms_dates_check CHECK (end_date >= start_date)
);

-- The hot query is "which term covers this week for this classroom".
CREATE INDEX IF NOT EXISTS idx_schedule_terms_classroom_range
  ON nexus_schedule_terms(classroom_id, start_date, end_date);

DROP TRIGGER IF EXISTS nexus_schedule_terms_updated_at ON nexus_schedule_terms;
CREATE TRIGGER nexus_schedule_terms_updated_at
  BEFORE UPDATE ON nexus_schedule_terms
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- Service-role only; all authorization happens in the API layer, matching the
-- convention used by every other Nexus table.
ALTER TABLE nexus_schedule_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_schedule_terms;
CREATE POLICY "service_role_full_access" ON nexus_schedule_terms
  FOR ALL TO service_role USING (true) WITH CHECK (true);
