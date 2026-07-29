-- ============================================================================
-- STUDY STAGE + PARTICIPATION STATUS
--
-- Two orthogonal facts about one enrolment, deliberately NOT one column.
--
--   current_standard      WHERE the student is in their studies. Drives priority
--                         and focus. Already exists (20260415_nexus_document_vault),
--                         CHECK ('10th','11th','12th','gap_year'). 19 of 28 rows in
--                         the live classroom are NULL. This migration adds only
--                         provenance for it.
--
--   participation_status  WHETHER they are still engaging. Drives inclusion in
--                         monitoring. New here.
--
-- A student can be Class 11 AND dormant. Collapsing the two into one column is
-- how you end up unable to answer "which of my exam-this-year students went
-- quiet", which is the only question that matters.
--
-- WHY A SEVENTH STATUS AXIS, given users already carries six:
--   users.lifecycle_status        CRM de-prioritisation. Does NOT block login.
--   users.is_alumni               graduated: Nexus access REVOKED.
--   users.nexus_access_enabled    per-student admit gate for the Nexus app.
--   users.is_disabled             ecosystem-wide kill switch.
--   users.status                  legacy account status.
--   users.exam_status             self-reported exam intent (100% NULL today).
--   nexus_enrollments.is_active   removed from THIS classroom (an exit).
--
-- All seven are about the PERSON or about ACCESS. participation_status is about
-- neither. A dormant student keeps Nexus login, keeps Teams calendar invites,
-- keeps class notifications, and keeps is_active = true. The door stays open.
-- What changes is that they stop being COUNTED: attendance %, submission rates,
-- prep readiness, the watchlist, checklist progress, RSVP, library engagement,
-- the document matrix, leaderboards, and every automated reminder.
--
-- The line: a message that exists because a CLASS exists still goes out; a
-- message that exists because a STUDENT failed to do something does not.
--
-- Precedent for this comment block: 20260622100000_alumni_graduation.sql.
-- ============================================================================

-- 1. Participation axis -------------------------------------------------------

ALTER TABLE nexus_enrollments
  ADD COLUMN IF NOT EXISTS participation_status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_enrollments_participation_status_check'
      AND conrelid = 'nexus_enrollments'::regclass
  ) THEN
    ALTER TABLE nexus_enrollments
      ADD CONSTRAINT nexus_enrollments_participation_status_check
      CHECK (participation_status IN ('active', 'dormant'));
  END IF;
END $$;

ALTER TABLE nexus_enrollments
  ADD COLUMN IF NOT EXISTS dormant_since  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dormant_reason TEXT,
  ADD COLUMN IF NOT EXISTS dormant_by     UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Provenance for the study stage -------------------------------------------
-- Without these, a value copied off a student's own onboarding form is
-- indistinguishable from a manager's deliberate decision. Both students named
-- as break-year cases have current_standard = NULL today, so the backfill in
-- step 5 can only ever be a partial answer and staff need to know which values
-- still want confirming.

ALTER TABLE nexus_enrollments
  ADD COLUMN IF NOT EXISTS current_standard_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_standard_set_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_standard_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_enrollments_current_standard_source_check'
      AND conrelid = 'nexus_enrollments'::regclass
  ) THEN
    ALTER TABLE nexus_enrollments
      ADD CONSTRAINT nexus_enrollments_current_standard_source_check
      CHECK (current_standard_source IS NULL
             OR current_standard_source IN ('staff', 'onboarding_backfill'));
  END IF;
END $$;

COMMENT ON COLUMN nexus_enrollments.participation_status IS
  'Whether this student is still engaging. active = counted in every metric. dormant = enrolled but disengaged, excluded from attendance %, submission rates, prep readiness, watchlist, checklist progress, RSVP, library engagement, document matrix, leaderboards and every automated reminder. NOT access control: dormant keeps Nexus login, Teams invites, class notifications and is_active = true. Distinct from is_active (removed from the classroom), users.is_alumni (graduated, access revoked) and users.nexus_access_enabled (admin kill switch).';

COMMENT ON COLUMN nexus_enrollments.dormant_since IS
  'When participation_status last became dormant. CLEARED on return to active, because a stale value would corrupt "how long were they away". The history lives in nexus_enrollment_classification_events.';

COMMENT ON COLUMN nexus_enrollments.dormant_reason IS
  'Required free text captured when marking dormant. Making a student invisible to every metric without saying why is exactly what this field prevents.';

COMMENT ON COLUMN nexus_enrollments.dormant_by IS
  'Staff user who marked them dormant. Requires the coord.student.classify capability (manager or admin).';

COMMENT ON COLUMN nexus_enrollments.current_standard IS
  'Study stage: 10th | 11th | 12th | gap_year. gap_year means finished Class 12 and preparing full time, so their exam is THIS year, same as 12th; the UI labels it "Break Year". NULL means nobody has said yet, and is treated as an actionable gap by the students screen, never as a default. Orthogonal to participation_status.';

COMMENT ON COLUMN nexus_enrollments.current_standard_source IS
  'staff = a manager or admin set it deliberately. onboarding_backfill = copied from the student''s own approved nexus_student_onboarding answer by migration 20260802090000, and therefore still worth confirming.';

-- 3. Audit trail ---------------------------------------------------------------
-- Append-only, following nexus_student_watchlist_events (20260726100000). Both
-- axes are consequential enough that "who changed this and why" must survive the
-- next change. Service-role only, so RLS on with no policy (default deny).

CREATE TABLE IF NOT EXISTS public.nexus_enrollment_classification_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.nexus_enrollments(id) ON DELETE CASCADE,
  classroom_id  UUID NOT NULL REFERENCES public.nexus_classrooms(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  axis          TEXT NOT NULL CHECK (axis IN ('study_stage', 'participation')),
  from_value    TEXT,
  to_value      TEXT,
  reason        TEXT,
  performed_by  UUID NOT NULL REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nexus_enrollment_classification_events IS
  'Append-only audit of study-stage and participation-status changes on nexus_enrollments. One row per changed axis per write.';

CREATE INDEX IF NOT EXISTS idx_nexus_classification_events_student
  ON public.nexus_enrollment_classification_events (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nexus_classification_events_classroom
  ON public.nexus_enrollment_classification_events (classroom_id, created_at DESC);

ALTER TABLE public.nexus_enrollment_classification_events ENABLE ROW LEVEL SECURITY;

-- 4. Read paths ----------------------------------------------------------------
-- The roster predicate (classroom + role + is_active + participation) and the
-- per-segment counts are the two shapes every monitoring surface now issues.

CREATE INDEX IF NOT EXISTS idx_nexus_enrollments_classroom_participation
  ON nexus_enrollments (classroom_id, participation_status)
  WHERE is_active = true AND role = 'student';

CREATE INDEX IF NOT EXISTS idx_nexus_enrollments_classroom_standard
  ON nexus_enrollments (classroom_id, current_standard)
  WHERE is_active = true AND role = 'student';

-- 5. Partial backfill ----------------------------------------------------------
-- CAREFUL: nexus_student_onboarding is keyed by student_id, NOT user_id. A join
-- written as o.user_id = e.user_id updates zero rows and still reports success,
-- so the correct join is spelled out here deliberately.
--
-- Only approved rows, only where nobody has set a stage yet. Expected effect on
-- production today: at most 10 rows (6 x '12th', 4 x '11th'), several of which
-- already carry the same value, so the real gain is smaller. Roughly 19 of 28
-- students will still have no stage after this runs. That is the expected
-- outcome, and it is why bulk assignment is a first-class requirement.

UPDATE nexus_enrollments e
   SET current_standard        = o.current_standard,
       current_standard_source = 'onboarding_backfill',
       current_standard_set_at = COALESCE(o.reviewed_at, o.submitted_at, now())
  FROM nexus_student_onboarding o
 WHERE o.student_id   = e.user_id
   AND o.classroom_id = e.classroom_id
   AND o.status       = 'approved'
   AND o.current_standard IS NOT NULL
   AND e.current_standard IS NULL
   AND e.role      = 'student'
   AND e.is_active = true;

NOTIFY pgrst, 'reload schema';
