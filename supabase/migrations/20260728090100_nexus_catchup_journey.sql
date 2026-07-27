-- ============================================
-- CATCH-UP JOURNEY: the backlog a student owes when they join mid-course
--
-- A student enrolled today has missed every class taught so far, and until now
-- that left no trace anywhere. nexus_class_absences only ever recorded the gap
-- between a roster and a Teams join list, which by definition cannot include
-- someone who was not on the roster when the class ran.
--
-- The item table is already the right shape: one row per (student, class),
-- unique on that pair, carrying "did they watch it" and "are they done". So a
-- late joiner's backlog is that same table with a third `kind`, not a parallel
-- table. Six surfaces already read nexus_class_absences; a second table would
-- turn every one of them into a UNION.
--
-- What is new is the header. Pacing (how many classes a week, measured from
-- when) belongs to a student's journey through a classroom, not to any single
-- class, so it would be denormalised onto N item rows.
--
-- What is deliberately NOT stored here:
--   * position. Order derives from the joined class's (scheduled_date,
--     start_time, id). A class added retroactively then slots into the right
--     place with no renumbering pass.
--   * due_on. It derives from (started_on, weekly_quota, index). Storing it
--     means a teacher changing the quota rewrites N rows, and the two can
--     disagree until that rewrite lands.
--   * assignment completion. Derived by joining nexus_assignment_submissions
--     and drawing_submissions, exactly as the catch-up route already does.
-- ============================================

-- 1. The journey header ------------------------------------------------------

CREATE TABLE IF NOT EXISTS nexus_catchup_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,

  -- A snapshot of enrolled_at::date, written once and never recomputed.
  -- enrollUser upserts on (user_id, classroom_id) and does NOT reset
  -- enrolled_at, so a student removed in May and restored in September would
  -- otherwise inherit a May clock and be "four months behind" on day one.
  started_on DATE NOT NULL,

  -- Snapshotted from nexus_classrooms.catchup_weekly_quota at creation. A
  -- teacher raising the classroom default from 2 to 3 must not instantly put
  -- every existing student behind pace on work they were never asked for.
  weekly_quota INTEGER NOT NULL DEFAULT 2 CHECK (weekly_quota BETWEEN 1 AND 14),

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'paused', 'abandoned')),

  generated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Throttles the weekly behind-pace nudge. One journey, one clock.
  last_nudged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One journey per student per classroom. The generator re-runs (on enrolment
  -- and again from the weekly sweep) and must not accumulate.
  UNIQUE (student_id, classroom_id)
);

-- The two hot reads: one student's own journey, and the teacher dashboard's
-- "everyone still working through a backlog in this classroom".
CREATE INDEX IF NOT EXISTS idx_catchup_journeys_student
  ON nexus_catchup_journeys(student_id);
CREATE INDEX IF NOT EXISTS idx_catchup_journeys_classroom_active
  ON nexus_catchup_journeys(classroom_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS nexus_catchup_journeys_updated_at ON nexus_catchup_journeys;
CREATE TRIGGER nexus_catchup_journeys_updated_at
  BEFORE UPDATE ON nexus_catchup_journeys
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- Service-role only; authorization happens in the API layer, matching every
-- other Nexus table.
ALTER TABLE nexus_catchup_journeys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_catchup_journeys;
CREATE POLICY "service_role_full_access" ON nexus_catchup_journeys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. The classroom-level pacing default --------------------------------------

-- Per-classroom, so not nexus_settings (that is a single global key/value row).
-- A first-year cohort and a repeat batch can reasonably carry different loads.
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS catchup_weekly_quota INTEGER NOT NULL DEFAULT 2;

-- 3. Widen the item table ----------------------------------------------------

-- kind is a CHECK, not an enum, so widening it is a cheap drop and re-add
-- rather than an ALTER TYPE that would need its own migration file.
ALTER TABLE nexus_class_absences
  DROP CONSTRAINT IF EXISTS nexus_class_absences_kind_check;
ALTER TABLE nexus_class_absences
  ADD CONSTRAINT nexus_class_absences_kind_check
  CHECK (kind IN ('no_show', 'opted_out', 'late_joiner'));

-- Only genuine per-STUDENT state is stored. Everything that is a fact about the
-- CLASS is derived at read time, because all of it can change after generation
-- and a snapshot would quietly go stale:
--   * which recap to watch      -> join nexus_class_recaps on scheduled_class_id
--                                  where status = 'published'. A teacher can
--                                  unpublish one and publish a better one.
--   * which test must be passed -> join nexus_test_placements on
--                                  (context_type = 'catchup_class', context_id
--                                  = scheduled_class_id). One test per class,
--                                  shared by every student.
--   * can it be caught up at all-> classifyCatchupCandidate() over the live
--                                  recording columns. A recording added next
--                                  week must revive the item on its own.
ALTER TABLE nexus_class_absences
  -- NULL journey_id means a classic absence: a student who was on the roster
  -- and did not turn up. Everything below is NULL for those rows, and the
  -- existing absence loop is untouched by this migration.
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES nexus_catchup_journeys(id) ON DELETE SET NULL,

  -- A state machine, not a fact about the world, which is why it is stored and
  -- clearable rather than derived. Set when the gated recap completes, CLEARED
  -- by a failed attempt. That single clearing write is the whole "fail means
  -- rewatch before you retry" rule, enforced server side.
  ADD COLUMN IF NOT EXISTS test_unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS test_passed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rewatch_count INTEGER NOT NULL DEFAULT 0,

  -- A teacher waiving one item. It leaves the student's backlog AND the pace
  -- denominator, so waiving work cannot make someone look behind.
  ADD COLUMN IF NOT EXISTS excused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excused_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS excuse_note TEXT;

-- The student's own backlog, ordered by the joined class. Partial, because
-- classic absences never carry a journey_id and would only bloat it.
CREATE INDEX IF NOT EXISTS idx_class_absences_journey
  ON nexus_class_absences(journey_id) WHERE journey_id IS NOT NULL;

-- 4. Let a class hold exactly one active catch-up test ------------------------

-- classroom_assignment and student_practice may hold many tests; every gated
-- single-test context may hold one. catchup_class joins that second group.
DROP INDEX IF EXISTS uq_placement_single_test;
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_single_test
  ON nexus_test_placements(context_type, context_id)
  WHERE is_active = true
    AND context_type IN ('study_file', 'class_recap_section', 'foundation_section', 'module_item', 'catchup_class');

-- 5. Teacher-facing notifications --------------------------------------------

ALTER TABLE nexus_timetable_notifications
  DROP CONSTRAINT IF EXISTS nexus_timetable_notifications_event_type_check;
ALTER TABLE nexus_timetable_notifications
  ADD CONSTRAINT nexus_timetable_notifications_event_type_check
  CHECK (event_type IN (
    'rsvp_attending',
    'rsvp_not_attending',
    'class_created',
    'class_cancelled',
    'class_rescheduled',
    'holiday_marked',
    'recording_available',
    'review_submitted',
    'assignment_published',
    'assignment_reviewed',
    'assignment_nudge',
    'week_published',
    'class_missed_followup',
    'absence_reason_needed',
    -- New: the weekly roll-up of students who have slipped behind their pace,
    -- and the standing list of classes that cannot be caught up at all.
    'catchup_needs_attention',
    'catchup_no_recording'
  ));

-- PostgREST caches the schema. Without this, every read of the new columns
-- fails with "column does not exist" until the cache happens to refresh.
NOTIFY pgrst, 'reload schema';
