-- Knows Tamil: a per-student language fact that staff record in Nexus.
--
-- Classes run in Tamil and in English, and a teacher planning a class, a recap or
-- a one-to-one needs to see at a glance who can follow Tamil. Nothing recorded it:
-- users.preferred_language exists, but every writer stamps 'en' at sign-up and
-- nothing ever changes it, so it says nothing about the person. It is left alone
-- here because it means "language of the interface", not "languages they know".
--
-- Tri-state on purpose. TRUE is "Knows Tamil", FALSE is "English only", and NULL
-- is "nobody has recorded it yet". Collapsing NULL into FALSE would label every
-- student we have never asked as English only.
--
-- Per USER, not per enrolment: a returning student's language does not change
-- between the 2026 and 2027 classrooms. Same shape as users.academic_year.
--
-- No knows_tamil_set_by / _set_at columns. The write goes through
-- recordUserHistory (user_profile_history, field 'knows_tamil') and the
-- classification audit below, which already say who changed it and when.
--
-- Staff only. The Nexus routes that read it are staff-gated, and the avatar badge
-- that shows it is mounted in the teacher layout alone.

-- 1. The fact -----------------------------------------------------------------

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS knows_tamil BOOLEAN;

COMMENT ON COLUMN public.users.knows_tamil IS
  'Staff recorded in Nexus (capability coord.student.stage). TRUE knows Tamil, FALSE English only, NULL not recorded. Audited in user_profile_history (field knows_tamil) and nexus_enrollment_classification_events (axis language). Never shown to students. Unrelated to preferred_language.';

-- 2. Fourth axis on the classification audit -----------------------------------
-- Set by the same gesture on the same sheet as class and exam year, so it belongs
-- on the same timeline. Like academic_year, the row records a change to users,
-- and enrollment_id only says which classroom the staff member was working in.

ALTER TABLE public.nexus_enrollment_classification_events
  DROP CONSTRAINT IF EXISTS nexus_enrollment_classification_events_axis_check;

ALTER TABLE public.nexus_enrollment_classification_events
  ADD CONSTRAINT nexus_enrollment_classification_events_axis_check
  CHECK (axis IN ('study_stage', 'participation', 'academic_year', 'language'));

NOTIFY pgrst, 'reload schema';
