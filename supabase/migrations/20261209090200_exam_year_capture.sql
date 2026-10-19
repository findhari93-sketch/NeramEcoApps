-- Exam year capture: record WHERE a stated exam year came from.
--
-- About 1,600 of 1,873 accounts only have an exam year estimated from their
-- sign-up date (user_lifecycle_view.exam_year_source = 'signup'). The Tools App
-- sheet, Aintra, demo booking, the apply forms, staff and the exam setup card
-- now all ask, and all write through recordStatedExamYear()
-- (packages/database/src/queries/exam-profile.ts) into
-- user_exam_profiles.planning_year. These columns say which surface it was and
-- when, so the CRM can tell a fresh answer from an old one.
--
-- demo_class_registrations.exam_year keeps the year typed on a demo booking
-- with the booking itself, including bookings staff add for people who have
-- no account yet.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.user_exam_profiles
  ADD COLUMN IF NOT EXISTS planning_year_source text,
  ADD COLUMN IF NOT EXISTS planning_year_set_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_exam_profiles_planning_year_source_check'
      AND conrelid = 'public.user_exam_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_exam_profiles
      ADD CONSTRAINT user_exam_profiles_planning_year_source_check
      CHECK (
        planning_year_source IS NULL
        OR planning_year_source IN ('tools_sheet', 'aintra', 'demo', 'apply', 'staff', 'exam_setup')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.user_exam_profiles.planning_year_source IS
  'Surface that recorded planning_year: tools_sheet, aintra, demo, apply, staff or exam_setup. NULL for rows saved before 2026-12.';
COMMENT ON COLUMN public.user_exam_profiles.planning_year_set_at IS
  'When planning_year was last stated.';

ALTER TABLE public.demo_class_registrations
  ADD COLUMN IF NOT EXISTS exam_year integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'demo_class_registrations_exam_year_check'
      AND conrelid = 'public.demo_class_registrations'::regclass
  ) THEN
    ALTER TABLE public.demo_class_registrations
      ADD CONSTRAINT demo_class_registrations_exam_year_check
      CHECK (exam_year IS NULL OR exam_year BETWEEN 2020 AND 2040);
  END IF;
END $$;

COMMENT ON COLUMN public.demo_class_registrations.exam_year IS
  'Year the student will write NATA or JEE B.Arch, asked on the demo booking (required from 2026-12).';

NOTIFY pgrst, 'reload schema';
