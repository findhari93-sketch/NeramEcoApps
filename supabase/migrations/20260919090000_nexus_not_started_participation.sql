-- ============================================================================
-- NOT STARTED: an automatic kind of dormant for students who never entered Nexus
--
-- Founder rule, 2026-09-14. A profile photo is the way into Nexus (the
-- student.photo-gate flag has been ON in prod since 2026-09-12). A student who
-- has never got past that gate is not yet taking part, so they must not inflate
-- "Not started" on a test, drag an attendance rate, or sit on a watchlist.
--
-- Two situations used to share the word "dormant":
--
--   dormant_source = 'auto'   NOT STARTED. Enrolled, never entered Nexus. Set by
--                             the trigger below, lifted by /api/auth/me the first
--                             time the student gets in with a photo. No human.
--   dormant_source = 'staff'  PAUSED. Was here, stepped away (refund, stopped
--                             attending, joining later). Set and cleared only by
--                             staff, with a reason. Signing in again does NOT
--                             bring them back; the Students page flags it.
--
-- Both keep participation_status = 'dormant', so every existing exclusion
-- (roster.ts, stage-facts, dropDormant, sendNudge, ~30 routes) drops Not started
-- students with no change at the call site. A third status value would have
-- needed every "= 'dormant'" check rewritten, and a missed one re-counts
-- students silently.
--
-- Still not access control. The photo gate decides who gets in.
-- ============================================================================

-- 1. Columns ------------------------------------------------------------------

ALTER TABLE nexus_enrollments
  ADD COLUMN IF NOT EXISTS dormant_source TEXT,
  ADD COLUMN IF NOT EXISTS join_reminders_sent SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nexus_entered_at TIMESTAMPTZ;

COMMENT ON COLUMN nexus_enrollments.dormant_source IS
  'Who made this enrolment dormant. auto = Not started: the student has never entered Nexus (users.nexus_entered_at IS NULL); set by trg_nexus_enrollment_not_started, lifted by /api/auth/me on first entry. staff = paused by a person with a reason; only staff clear it. NULL exactly when participation_status = active.';

COMMENT ON COLUMN nexus_enrollments.join_reminders_sent IS
  'How many automatic "come into Nexus" reminders this Not started enrolment has had (max 3: day 1, 3, 7). Written only by /api/cron/join-reminders.';

COMMENT ON COLUMN users.nexus_entered_at IS
  'First time this student got past the Nexus photo gate. Distinct from nexus_first_login_at, which is stamped even when the gate stopped them. NULL means Not started. Written only by /api/auth/me.';

-- 2. System-written audit rows --------------------------------------------------
-- performed_by NULL now means "a system rule wrote this" (Not started marked on
-- enrolment, or lifted on first entry).

ALTER TABLE public.nexus_enrollment_classification_events
  ALTER COLUMN performed_by DROP NOT NULL;

-- 3. Sign-in history -------------------------------------------------------------
-- One row per app open, throttled to one per 30 minutes per student by the only
-- writer (/api/auth/me). Lets a teacher tell "never tried" from "tried twice and
-- stopped at the photo step".

CREATE TABLE IF NOT EXISTS public.nexus_sign_in_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome     TEXT NOT NULL CHECK (outcome IN ('entered', 'photo_step')),
  device      TEXT CHECK (device IS NULL OR device IN ('Phone', 'Tablet', 'Laptop'))
);

COMMENT ON TABLE public.nexus_sign_in_events IS
  'Student Nexus sign-ins. outcome entered = got into the app; photo_step = the photo gate stopped them. Written only by /api/auth/me (never during View as Student), at most one row per 30 minutes per user.';

CREATE INDEX IF NOT EXISTS idx_nexus_sign_in_events_user
  ON public.nexus_sign_in_events (user_id, occurred_at DESC);

ALTER TABLE public.nexus_sign_in_events ENABLE ROW LEVEL SECURITY;

-- 4. Backfill: who has already entered ---------------------------------------------
-- Before the gate went on, anyone who signed in with a photo was taking part.

UPDATE users
SET nexus_entered_at = nexus_first_login_at
WHERE nexus_entered_at IS NULL
  AND nexus_first_login_at IS NOT NULL
  AND COALESCE(photo_status, 'missing') <> 'missing';

-- E2E fixture accounts are rebuilt by tests that expect a counted student.
UPDATE users
SET nexus_entered_at = now()
WHERE nexus_entered_at IS NULL
  AND email ILIKE 'e2e%@neramclasses.com';

-- 5. Backfill: existing dormant rows were all set by staff ------------------------

UPDATE nexus_enrollments
SET dormant_source = 'staff'
WHERE participation_status = 'dormant'
  AND dormant_source IS NULL;

-- 6. Backfill: mark current Not started students ------------------------------------

WITH marked AS (
  UPDATE nexus_enrollments e
  SET participation_status = 'dormant',
      dormant_source = 'auto',
      dormant_since = COALESCE(e.enrolled_at, now()),
      dormant_reason = 'Has not entered Nexus yet',
      dormant_by = NULL
  FROM users u
  WHERE u.id = e.user_id
    AND e.role = 'student'
    AND e.is_active IS TRUE
    AND e.participation_status = 'active'
    AND u.nexus_entered_at IS NULL
    AND u.is_alumni IS NOT TRUE
  RETURNING e.id, e.classroom_id, e.user_id
)
INSERT INTO public.nexus_enrollment_classification_events
  (enrollment_id, classroom_id, student_id, axis, from_value, to_value, reason, performed_by)
SELECT id, classroom_id, user_id, 'participation', 'active', 'dormant',
       'Not started: has not entered Nexus yet', NULL
FROM marked;

-- 7. Source must match status ---------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_enrollments_dormant_source_check'
      AND conrelid = 'nexus_enrollments'::regclass
  ) THEN
    ALTER TABLE nexus_enrollments
      ADD CONSTRAINT nexus_enrollments_dormant_source_check
      CHECK (
        (participation_status = 'active' AND dormant_source IS NULL)
        OR (participation_status = 'dormant' AND dormant_source IN ('staff', 'auto'))
      );
  END IF;
END $$;

-- 8. Trigger: every enrolment writer gets the rule for free ------------------------------
-- Admin Grant, teacher add, Entra sync, promote auto-enrol and test-login all
-- insert or upsert nexus_enrollments. Hooking each one is how a fifth writer gets
-- missed, so the rule lives on the table.
--
-- It also normalises dormant_source, so a writer that only knows about
-- participation_status (older code during a deploy window) can never break the
-- CHECK above: active clears the source, dormant without one is a staff decision.
--
-- Upserts: supabase-js sends ON CONFLICT DO UPDATE SET only for the columns in
-- the payload, and no writer sends participation_status, so an existing row's
-- status is never overwritten by the BEFORE INSERT change.

CREATE OR REPLACE FUNCTION public.nexus_enrollment_not_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entered TIMESTAMPTZ;
  alumni BOOLEAN;
BEGIN
  IF NEW.role = 'student'
     AND NEW.is_active IS TRUE
     AND NEW.participation_status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.is_active IS NOT TRUE)
  THEN
    SELECT u.nexus_entered_at, u.is_alumni INTO entered, alumni
    FROM users u WHERE u.id = NEW.user_id;

    IF FOUND AND entered IS NULL AND alumni IS NOT TRUE THEN
      NEW.participation_status := 'dormant';
      NEW.dormant_source := 'auto';
      NEW.dormant_since := now();
      NEW.dormant_reason := 'Has not entered Nexus yet';
      NEW.dormant_by := NULL;
    END IF;
  END IF;

  IF NEW.participation_status = 'active' THEN
    NEW.dormant_source := NULL;
  ELSIF NEW.dormant_source IS NULL THEN
    NEW.dormant_source := 'staff';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nexus_enrollment_not_started ON nexus_enrollments;
CREATE TRIGGER trg_nexus_enrollment_not_started
  BEFORE INSERT OR UPDATE OF is_active, participation_status, dormant_source ON nexus_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.nexus_enrollment_not_started();

-- The audit row has to be written AFTER the enrolment exists (its FK).
CREATE OR REPLACE FUNCTION public.nexus_enrollment_not_started_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dormant_source = 'auto'
     AND (TG_OP = 'INSERT' OR OLD.dormant_source IS DISTINCT FROM 'auto')
  THEN
    INSERT INTO nexus_enrollment_classification_events
      (enrollment_id, classroom_id, student_id, axis, from_value, to_value, reason, performed_by)
    VALUES
      (NEW.id, NEW.classroom_id, NEW.user_id, 'participation',
       CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.participation_status END,
       'dormant', 'Not started: has not entered Nexus yet', NULL);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nexus_enrollment_not_started_audit ON nexus_enrollments;
CREATE TRIGGER trg_nexus_enrollment_not_started_audit
  AFTER INSERT OR UPDATE OF is_active, participation_status, dormant_source ON nexus_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.nexus_enrollment_not_started_audit();

-- 9. Photo review badge: Not started students stay in the queue ----------------------------
-- They are exactly the people Photo Review exists for. lib/photo-review-roster.ts
-- carries the same clause; photo-review-predicate.test.ts holds the two together.

DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname = 'count_pending_photo_reviews'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END
$drop$;

CREATE OR REPLACE FUNCTION public.count_pending_photo_reviews(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer_classrooms AS (
    SELECT e.classroom_id
    FROM public.nexus_enrollments e
    JOIN public.nexus_classrooms c
      ON c.id = e.classroom_id
     AND c.is_active IS NOT FALSE
     AND c.is_archived IS NOT TRUE
    WHERE e.user_id = p_user_id
      AND e.is_active IS TRUE
  )
  SELECT COALESCE(count(DISTINCT u.id), 0)::integer
  FROM public.nexus_enrollments e
  JOIN viewer_classrooms vc
    ON vc.classroom_id = e.classroom_id
  JOIN public.users u
    ON u.id = e.user_id
  WHERE e.is_active IS TRUE
    AND e.role = 'student'
    AND (e.participation_status = 'active' OR e.dormant_source = 'auto')
    AND u.photo_status = 'pending'
    AND u.is_alumni IS NOT TRUE
    AND u.ms_oid IS NOT NULL
    AND u.ms_oid <> '';
$$;

REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_pending_photo_reviews(uuid) TO service_role;

COMMENT ON FUNCTION public.count_pending_photo_reviews(uuid) IS
  'Distinct students awaiting a profile photo decision (participating, or Not started), restricted to the classrooms p_user_id has an active enrollment in. Same population the /teacher/photo-review queue shows that person. Backs the Nexus staff nav badge.';

NOTIFY pgrst, 'reload schema';
