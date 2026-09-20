-- Student language, second round: five languages instead of "Tamil or not".
--
-- 20260922090000 added users.knows_tamil as a tri-state boolean. Two things were
-- wrong with it:
--
--   1. It only knows one language. This batch holds a Kannada student and a Hindi
--      student, and Malayalam has to be offerable before the first one arrives.
--   2. "Not recorded" was a state staff could see. English is mandatory here, so a
--      student nobody has asked about IS English, not unknown. Every student maps
--      to exactly one language.
--
-- home_language is NULLABLE on purpose, and NULL still means "nobody recorded it".
-- The app renders NULL as English everywhere, so there is no third state on screen,
-- which is the decision. Keeping the difference in the column costs nothing, leaves
-- "which of these did we actually confirm?" answerable later, and avoids asserting
-- a language for the ~1,900 rows here that are leads, parents and staff.
--
-- limited_english is the rare, high-stakes case: a student who cannot follow a
-- class taught in English. It rides on top of the language rather than replacing
-- it (a student is "Tamil, limited English"), and it is what flips their avatar
-- mark from a filled disc to an outlined one.
--
-- Per USER, not per enrolment, like users.academic_year: a returning student's
-- language does not change between the 2026 and 2027 classrooms.
--
-- knows_tamil is deliberately NOT dropped here. Production already carries this
-- data and may be serving code that reads that column; dropping it out from under
-- a running deploy is how every cohort ring in Nexus disappears at once. It goes
-- dead the moment the new code ships, and a separate one-line migration retires it
-- once that is live everywhere.

-- 1. The two columns ----------------------------------------------------------

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS home_language TEXT;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_home_language_check;
ALTER TABLE public.users ADD CONSTRAINT users_home_language_check
  CHECK (home_language IN ('english', 'tamil', 'hindi', 'kannada', 'malayalam'));

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS limited_english BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.home_language IS
  'Staff recorded in Nexus (capability coord.student.stage). The one language besides English that the student follows best: english, tamil, hindi, kannada or malayalam. NULL means nobody has recorded it and the app shows it as English. Audited in user_profile_history (field home_language) and nexus_enrollment_classification_events (axis language). Never shown to students. Unrelated to preferred_language, which is the interface locale. Supersedes knows_tamil.';

COMMENT ON COLUMN public.users.limited_english IS
  'Staff recorded in Nexus. TRUE means the student cannot follow a class taught in English, so their home_language has to be used with them. Rare. Audited in user_profile_history (field limited_english) and nexus_enrollment_classification_events (axis english_fluency).';

-- 2. Carry the first round's answers across ------------------------------------
-- Production holds 24 students marked Knows Tamil, set by staff through the Set
-- stage sheet. This is the only real language data that exists, so it moves first
-- and the app never reads knows_tamil again.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'knows_tamil'
  ) THEN
    UPDATE public.users SET home_language = 'tamil'
      WHERE knows_tamil IS TRUE AND home_language IS NULL;
    UPDATE public.users SET home_language = 'english'
      WHERE knows_tamil IS FALSE AND home_language IS NULL;
  END IF;
END $$;

-- 3. Fifth axis on the classification audit ------------------------------------
-- 'language' already exists and keeps its meaning, now carrying the language key
-- (tamil, hindi, ...) rather than tamil/english. The 24 rows already written say
-- 'tamil', which still reads correctly. english_fluency is the new tick, set by
-- the same gesture on the same sheet, so it belongs on the same timeline.

ALTER TABLE public.nexus_enrollment_classification_events
  DROP CONSTRAINT IF EXISTS nexus_enrollment_classification_events_axis_check;

ALTER TABLE public.nexus_enrollment_classification_events
  ADD CONSTRAINT nexus_enrollment_classification_events_axis_check
  CHECK (axis IN ('study_stage', 'participation', 'academic_year', 'language', 'english_fluency'));

NOTIFY pgrst, 'reload schema';
