-- ============================================
-- THE COURSE PLAN OWNS THE SEASON
--
-- 20260723120000 introduced `nexus_schedule_terms` to hold the shape of the
-- teaching day: date range, time bands, weekdays. That was a duplicate.
--
-- A teaching plan ALREADY has start_date and expected_end_date, and the older
-- nexus_course_plans rows already carry the same idea in `sessions_per_day`
-- (the live "NATA 2026 Crash Course" row stores am 11:00-12:00 and pm
-- 19:00-20:00 across seven days). So a plan IS a season, and asking a teacher
-- to describe the same crash course twice, once as a plan and once as a term,
-- is how the two drift apart.
--
-- This moves the two missing pieces onto the plan and drops the terms table.
-- Nothing is lost: `nexus_schedule_terms` was never deployed to production and
-- holds zero rows in staging.
--
-- Also adds class tagging, which reuses the existing question-bank tag registry
-- rather than inventing a second vocabulary. A class is "Aptitude" or
-- "Mathematics" in exactly the same sense a question is.
--
-- Additive and idempotent apart from the deliberate DROP.
-- ============================================

-- 1. The shape of the teaching day, on the plan that defines it.
--
--    Defaults reproduce today's behaviour exactly (evening only, Monday to
--    Saturday), so every existing plan keeps working untouched and no calendar
--    changes shape until someone deliberately edits it.
--
--    [{ start: 'HH:MM', end: 'HH:MM', label?: string }]
--    An array, not one start/end, because the crash course runs morning AND
--    evening with a long gap between. Two bands let the calendar collapse the
--    dead afternoon instead of drawing six empty hours.
ALTER TABLE nexus_teaching_plans
  ADD COLUMN IF NOT EXISTS class_bands JSONB NOT NULL
  DEFAULT '[{"start":"18:00","end":"21:00","label":"Evening"}]'::jsonb;

-- ISO weekdays, 1 = Monday. Crash plans often add Sunday.
ALTER TABLE nexus_teaching_plans
  ADD COLUMN IF NOT EXISTS class_days SMALLINT[] NOT NULL
  DEFAULT '{1,2,3,4,5,6}';

-- The hot query is "which plans cover this week for this classroom".
CREATE INDEX IF NOT EXISTS idx_teaching_plans_classroom_range
  ON nexus_teaching_plans(classroom_id, start_date, expected_end_date);

-- 2. Retire the duplicate.
--
--    Unlike terms, two plans MAY legitimately overlap in the builder today, so
--    the API treats an overlap as a warning and draws the union of both plans'
--    bands rather than rejecting it. A changeover week therefore shows the
--    morning appearing partway through, which is what actually happens.
DROP TABLE IF EXISTS nexus_schedule_terms;

-- 3. Class tags, reusing nexus_qb_tags.
--
--    The teacher often does not know the topic before the class: it gets named
--    afterwards, along with which subject it belonged to. Tagging the class with
--    the same tags used for questions means the recordings list can be searched
--    and filtered with a vocabulary that already exists and is already curated.
CREATE TABLE IF NOT EXISTS nexus_class_tags (
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES nexus_qb_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scheduled_class_id, tag_id)
);

-- Filtering recordings BY tag reads the other way round from the primary key.
CREATE INDEX IF NOT EXISTS idx_class_tags_tag ON nexus_class_tags(tag_id);

-- Service-role only; authorization happens in the API layer, matching every
-- other Nexus table.
ALTER TABLE nexus_class_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_class_tags;
CREATE POLICY "service_role_full_access" ON nexus_class_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);
