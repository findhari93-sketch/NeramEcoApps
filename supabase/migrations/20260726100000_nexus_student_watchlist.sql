-- ============================================
-- NEXUS STUDENT INACTIVITY WATCHLIST
-- Some students go completely silent: they never submit an assignment, never
-- show up to a class, never open Nexus. Until now the only signal was
-- assignments-only (getAssignmentEngagement), and removing a student could only
-- be done from the Admin app.
--
-- These two tables hold the human side of that. The SCORE is always computed
-- live from existing data (assignments, nexus_class_absences, login timestamps,
-- photo status), never stored as truth. What is stored here is what a teacher
-- DECIDED and what they actually TRIED.
--
--   nexus_student_watchlist         one row per (classroom, student): the
--                                   current ladder position.
--   nexus_student_watchlist_events  append-only record of every action taken.
--
-- Ladder: none -> nudged -> warned -> parent_contacted -> final_notice -> removed
-- Off-ramps: `resolved` (the student came back) and `snoozed_until` (hide the
-- row for a while without changing the stage, e.g. the student is sitting an
-- exam or is unwell).
--
-- Deliberately NOT reusing nexus_assignment_reminders: that table has a NOT NULL
-- assignment_id and models "who was reminded about this piece of work". This is
-- a per-student state machine scoped to a classroom.
--
-- Accessed only via the service-role admin client, so RLS is enabled with no
-- policy (default-deny for anon/authenticated; service role bypasses RLS).
-- ============================================

CREATE TABLE IF NOT EXISTS public.nexus_student_watchlist (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES public.nexus_classrooms(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stage         TEXT NOT NULL DEFAULT 'none'
    CHECK (stage IN ('none', 'nudged', 'warned', 'parent_contacted', 'final_notice', 'removed', 'resolved')),
  stage_set_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage_set_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Hide this row from the default view until this date. Does not change stage.
  snoozed_until DATE,
  -- Last computed score/tier, stored only so the list can be sorted and audited
  -- without recomputing. Never treated as truth.
  last_score    INTEGER,
  last_tier     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_watchlist_classroom_stage
  ON public.nexus_student_watchlist (classroom_id, stage);

ALTER TABLE public.nexus_student_watchlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.nexus_student_watchlist_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID NOT NULL REFERENCES public.nexus_student_watchlist(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN (
                    'nudge_sent', 'warning_sent', 'parent_contacted', 'final_notice_sent',
                    'removed', 'resolved', 'snoozed', 'note')),
  channel         TEXT,
  message         TEXT,
  -- The score and tier at the moment the action was taken, so the audit trail
  -- shows WHY a teacher escalated, not just that they did.
  score_at_action INTEGER,
  tier_at_action  TEXT,
  performed_by    UUID NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_watchlist_events_watchlist
  ON public.nexus_student_watchlist_events (watchlist_id, created_at DESC);

ALTER TABLE public.nexus_student_watchlist_events ENABLE ROW LEVEL SECURITY;
