-- ============================================================================
-- SCHEDULED TESTS: PRACTICE MODE, PROCTORING, ATTEMPT OVERRIDES
--
-- A teacher scheduling "50 shuffled questions from the 150-question History of
-- Architecture paper, today or tomorrow" needs an exam that is not a ranked,
-- leaderboard-published exam, that tracks whether a student left the paper
-- during the sitting, and that lets a teacher grant a second try without
-- touching the schema again per-student.
--
-- Everything here is additive and defaults to today's exact behavior:
--   - nexus_exams.mode defaults to 'ranked', so every existing exam and every
--     existing caller of createExamSeries is byte-identical to before.
--   - proctoring_enabled defaults to false, so no existing test grows a
--     fullscreen gate it never had.
--   - The two new tables are unread by any code until the query layer and UI
--     that consume them ship in later phases, so this migration changes
--     nothing observable in production on its own.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- nexus_exams: practice/no-rank mode + proctoring config
--
-- mode and proctoring_enabled are independent flags, not one inferred from the
-- other. A practice test (no leaderboard, no rank publish) can still want
-- proctoring on -- that is exactly the "ordinary class test, phones away"
-- scenario this migration exists for. A makeup sitting needs no separate flag:
-- it resolves to the same nexus_exams row via resolveExamWindowForStudent, so
-- proctoring_enabled already covers the makeup window for free.
-- ----------------------------------------------------------------------------
ALTER TABLE nexus_exams
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'ranked',
  ADD COLUMN IF NOT EXISTS proctoring_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS violation_limit INTEGER NOT NULL DEFAULT 3;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_exams_mode_check'
      AND conrelid = 'nexus_exams'::regclass
  ) THEN
    ALTER TABLE nexus_exams
      ADD CONSTRAINT nexus_exams_mode_check CHECK (mode IN ('ranked', 'practice'));
  END IF;
END $$;

COMMENT ON COLUMN nexus_exams.mode IS
  'ranked (the default, and what every pre-existing row is): a formal exam with rank + results-publish flow. practice: a scored but unranked class test -- results_state/rank publishing stays unused.';
COMMENT ON COLUMN nexus_exams.proctoring_enabled IS
  'Independent of mode. When true, the student player requests fullscreen (best-effort) and logs tab-switch/blur/fullscreen-exit violations to nexus_test_attempt_violations, auto-submitting once violation_limit is reached.';
COMMENT ON COLUMN nexus_exams.violation_limit IS
  'Number of logged violations (see nexus_test_attempt_violations) that trigger an automatic submit. Only consulted when proctoring_enabled is true.';

-- ----------------------------------------------------------------------------
-- What went wrong while a student was sitting a PROCTORED test
--
-- Modeled directly on nexus_test_attempt_errors (20260824090200): a diagnostic
-- log attached to one sitting, best-effort, never allowed to block or fail the
-- attempt it describes. attempt_id is NOT NULL here (unlike the errors table)
-- because proctoring only starts once an attempt already exists -- there is no
-- "failed before the paper loaded" case to make room for.
--
-- Attached to the attempt, not to nexus_exams, so a violation is scoped to one
-- sitting the same way the errors table already is, and so proctoring stays
-- reusable outside the exam context without another migration.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nexus_test_attempt_violations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.nexus_test_attempts(id) ON DELETE CASCADE,
  test_id    UUID NOT NULL REFERENCES public.nexus_tests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- tab_switch:      document visibilitychange fired while the attempt was active
  -- window_blur:     the browser window itself lost focus (desktop alt-tab)
  -- fullscreen_exit: the student left fullscreen after having entered it
  kind       TEXT NOT NULL CHECK (kind IN ('tab_switch', 'window_blur', 'fullscreen_exit')),
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nexus_test_attempt_violations IS
  'Proctoring signals logged while a student sat a proctoring_enabled exam: tab switches, window blur, and fullscreen exits. Client-reported and browser-observable only, same "best-effort, not a security boundary" posture as nexus_test_attempt_errors -- what IS enforced server-side is the auto-submit decision once nexus_exams.violation_limit is reached, not device-level lockdown.';

CREATE INDEX IF NOT EXISTS idx_test_attempt_violations_attempt
  ON public.nexus_test_attempt_violations (attempt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_attempt_violations_test_student
  ON public.nexus_test_attempt_violations (test_id, student_id);

ALTER TABLE public.nexus_test_attempt_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.nexus_test_attempt_violations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Per-student attempt-limit override, audited
--
-- Modeled on nexus_exam_makeups: a small, dedicated, audited grant table for
-- the same kind of teacher action (opening a door wider for one student). Not
-- a JSONB bump on nexus_test_placements.gating, because gating is shared by
-- the whole classroom's placement row -- a per-student override there would
-- need a nested map, would lose granted_by/granted_at, and would not be
-- cheaply batch-readable for the invigilation roster the way a real table is.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nexus_exam_attempt_overrides (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id        UUID NOT NULL REFERENCES public.nexus_exams(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  extra_attempts INTEGER NOT NULL DEFAULT 1,
  granted_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

COMMENT ON TABLE public.nexus_exam_attempt_overrides IS
  'A teacher-granted bump to how many attempts one student gets on one exam, on top of the placement''s own gating.attempt_limit. One row per (exam, student); extra_attempts accumulates on repeat grants. Read in bulk by the invigilation roster via getExamAttemptOverrides().';

CREATE INDEX IF NOT EXISTS idx_exam_attempt_overrides_exam ON public.nexus_exam_attempt_overrides (exam_id);

ALTER TABLE public.nexus_exam_attempt_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.nexus_exam_attempt_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- notify-students.ts needs a 'test_scheduled' event to announce a newly
-- scheduled test the same way class_created/class_rescheduled already are.
-- Full list re-stated because this CHECK constraint has no ALTER ... ADD VALUE
-- form (see 20260808090000_catchup_missed_classes.sql, the last migration that
-- has widened this constraint, for the same pattern).
-- ----------------------------------------------------------------------------
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
    'catchup_needs_attention',
    'catchup_no_recording',
    'recap_draft_ready',
    'catchup_overdue',
    'test_scheduled'
  ));

-- PostgREST caches the schema. Without this, the first insert against a widened
-- constraint or a brand-new table fails until the cache happens to reload.
NOTIFY pgrst, 'reload schema';
