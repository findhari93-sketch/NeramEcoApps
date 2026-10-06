-- ============================================================================
-- SILENT ABSENCE: THE NUDGE LOG AND THE ACCESS HOLD
--
-- A student down as attending who does not join and says nothing anywhere (no
-- away window, no reason on the class, no decline) is a `no_reason` cell in
-- lib/attendance-register.ts. Three of those in a row, each with a message SENT
-- AND PROVEN SEEN, is the only thing that puts a hold on Nexus access.
--
-- THE STREAK IS NEVER STORED. lib/silent-streak.ts recomputes it from
-- nexus_attendance, nexus_class_absences, nexus_class_rsvp and
-- nexus_student_away_windows every time it is asked. Attendance and reasons
-- both move BACKWARDS in time: a teacher marks somebody present by hand the
-- next morning, a student files a reason three days later, a Teams sync lands a
-- week late. A stored counter is a cache that goes stale in the one direction
-- that hurts a student. What is stored here is what we SENT and what was
-- DECIDED, which is the same discipline nexus_student_watchlist keeps for its
-- own score.
--
-- WHY NOT SOMEWHERE THAT ALREADY EXISTS:
--
--   NOT a rung on nexus_student_watchlist. That table is UNIQUE(classroom_id,
--   student_id) while Nexus access is account-scoped and read by
--   /api/auth/me, which has a user and no classroom. Its single `stage` column
--   is also driven by lib/inactivity-score.ts, so two sweeps writing one column
--   would overwrite each other. A TEACHER's manual hold still writes a `note`
--   row to nexus_student_watchlist_events, which needs no migration, so the
--   ladder a teacher reads carries the hold in line with the nudges. Automatic
--   rows do not, because that table's performed_by NOT NULL is a promise that
--   every row on it was a person's act.
--
--   NOT nexus_enrollments.participation_status. Migration 20260802090000 says
--   in three places that dormancy is NOT access control, and
--   lib/dormant-guard.test.ts enforces it.
--
--   NOT users.nexus_access_enabled. Removed; see tests/e2e/nexus-access-gate.spec.ts.
--
-- NO NEW NOTIFICATION EVENT TYPE. `absence_reason_needed` already exists
-- (20260918090100) and NotificationBell.tsx already routes it to
-- /student/timetable/{class_id}/catch-up, which is exactly where these messages
-- point. lib/test-chase.ts warns in its own comments that inventing an enum
-- value risks a send silently dropping on prod when a migration drifts, so this
-- reuses one that is already live everywhere.
-- ============================================================================

-- 1. The nudge log: one row per (student, class) we have asked about ----------
--
-- The UNIQUE constraint IS the claim. The sweep inserts FIRST and treats a
-- 23505 as "another run already took this one", which is the only one of the
-- repo's four dedupe patterns that is safe under concurrent cron retries, and
-- lib/sketchbook-reminder-store.ts does the same.
--
-- Keyed on the CLASS, not on a cooldown. The thing being deduped is "have we
-- asked about this class", not "have we messaged this student recently": a
-- per-student cooldown would suppress the second class's message and we would
-- then be holding somebody over a streak of three where only two were ever
-- asked about.
CREATE TABLE IF NOT EXISTS public.nexus_absence_reason_nudges (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  classroom_id       UUID NOT NULL REFERENCES public.nexus_classrooms(id) ON DELETE CASCADE,
  scheduled_class_id UUID NOT NULL REFERENCES public.nexus_scheduled_classes(id) ON DELETE CASCADE,
  -- 1 to 3. Step 3 names the consequence in words, so nobody is ever held
  -- without having been told in those words first.
  step               SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 3),
  streak_at_send     SMALLINT NOT NULL DEFAULT 0,
  -- sendNudge's own per-recipient receipt string, kept verbatim.
  channel            TEXT,
  -- A Teams 1:1 chat from Neram Assistant actually landed. False today on prod
  -- because staff.assistant-sender is off until the Teams manifest is approved;
  -- it starts counting the day that flips, with no code change here.
  chat_landed        BOOLEAN NOT NULL DEFAULT false,
  notification_id    UUID,
  -- PROOF THE WORDS WERE IN FRONT OF THEM. Descends from
  -- user_notifications.read_at, which NotificationBell only sets after the row
  -- sat on screen for SEEN_DWELL_MS. Latched one-way by the sweep so pruning a
  -- notification row can never silently un-warn a student.
  seen_at            TIMESTAMPTZ,
  sent_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL means the cron sent it. A teacher pressing "Nudge now" is named here,
  -- and shares this same per-class claim so the two cannot double up.
  sent_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (student_id, scheduled_class_id)
);

CREATE INDEX IF NOT EXISTS idx_absence_nudges_student_sent
  ON public.nexus_absence_reason_nudges (student_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_absence_nudges_classroom_sent
  ON public.nexus_absence_reason_nudges (classroom_id, sent_at DESC);

ALTER TABLE public.nexus_absence_reason_nudges ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.nexus_absence_reason_nudges IS
  'One row per (student, class) we have asked for a reason about. The UNIQUE pair is the dedupe claim. seen_at is the evidence a hold is built on.';
COMMENT ON COLUMN public.nexus_absence_reason_nudges.seen_at IS
  'Latched from user_notifications.read_at. A hold requires this (or chat_landed) on EVERY class in the streak.';

-- 2. The hold. Account scoped, history kept ----------------------------------
CREATE TABLE IF NOT EXISTS public.nexus_student_access_restrictions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Access is account scoped; the CAUSE is classroom scoped. Nullable so a
  -- classroom can be archived without erasing why somebody was held.
  classroom_id  UUID REFERENCES public.nexus_classrooms(id) ON DELETE SET NULL,
  reason        TEXT NOT NULL DEFAULT 'silent_absence'
                  CHECK (reason IN ('silent_absence', 'manual')),
  -- The classes the streak was made of, newest first: [{id, title, date}].
  -- Denormalised ON PURPOSE so /api/auth/me renders the blocker with no join,
  -- and so the student and the teacher see the same evidence without either
  -- having to take our word for it.
  evidence      JSONB NOT NULL DEFAULT '[]'::jsonb,
  streak_at_set SMALLINT,
  set_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL means a rule did this, matching the convention
  -- nexus_enrollment_classification_events.performed_by already uses.
  set_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  set_note      TEXT,
  lifted_at     TIMESTAMPTZ,
  lifted_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- student_cleared: they recorded the reasons and the streak genuinely broke.
  -- teacher:         somebody took the call and let them back in.
  -- expired:         nobody reviewed it for 30 days, so it lapsed. A hold
  --                  nobody has looked at in a month is an abandoned decision
  --                  and the student should stop paying for our inattention.
  --                  Same spirit as review_on on nexus_student_away_windows.
  lifted_reason TEXT CHECK (lifted_reason IS NULL OR lifted_reason IN
                  ('student_cleared', 'teacher', 'expired')),
  lift_note     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The gate's ENTIRE read: student_id = ? AND lifted_at IS NULL. One partial
-- index probe, on the hottest route in the app. The partial unique also makes
-- a double hold impossible, so a retrying cron cannot stack two.
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_restriction_live
  ON public.nexus_student_access_restrictions (student_id) WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_access_restriction_classroom
  ON public.nexus_student_access_restrictions (classroom_id, set_at DESC);

DROP TRIGGER IF EXISTS nexus_access_restrictions_updated_at
  ON public.nexus_student_access_restrictions;
CREATE TRIGGER nexus_access_restrictions_updated_at
  BEFORE UPDATE ON public.nexus_student_access_restrictions
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

ALTER TABLE public.nexus_student_access_restrictions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.nexus_student_access_restrictions IS
  'A hold on Nexus access. Account scoped. One live row per student, enforced by uq_access_restriction_live. set_by NULL means a rule did it.';

-- 3. Tell "never tried" from "stopped at the gate" ---------------------------
--
-- Exactly what the photo gate did when it shipped: without its own outcome
-- value there is no way to know whether anybody ever hit the screen, and a gate
-- you cannot observe is one nobody can judge.
ALTER TABLE public.nexus_sign_in_events
  DROP CONSTRAINT IF EXISTS nexus_sign_in_events_outcome_check;
ALTER TABLE public.nexus_sign_in_events
  ADD CONSTRAINT nexus_sign_in_events_outcome_check
  CHECK (outcome IN ('entered', 'photo_step', 'absence_step'));

COMMENT ON TABLE public.nexus_sign_in_events IS
  'Student Nexus sign-ins. outcome entered = got into the app; photo_step = the photo gate stopped them; absence_step = the silent-absence hold stopped them. Written only by /api/auth/me (never during View as Student), at most one row per 30 minutes per user.';

NOTIFY pgrst, 'reload schema';
