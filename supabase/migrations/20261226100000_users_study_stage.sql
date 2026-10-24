-- Where a person is in school, recorded by staff from any Admin avatar.
--
-- Admin shows a break-year student (finished Class 12, results in hand,
-- preparing full time) with an orange exam pill. Nexus keeps this for its
-- students on nexus_enrollments.current_standard; leads had nowhere for staff
-- to write it. Same four values, so Admin and Nexus agree. For a student with an
-- active enrolment, Admin also writes the enrolment and the enrolment wins.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS study_stage text
    CONSTRAINT users_study_stage_check CHECK (study_stage IN ('10th', '11th', '12th', 'gap_year')),
  ADD COLUMN IF NOT EXISTS study_stage_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS study_stage_set_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS twelfth_passed_year smallint
    CONSTRAINT users_twelfth_passed_year_check CHECK (twelfth_passed_year BETWEEN 1990 AND 2100);

COMMENT ON COLUMN public.users.study_stage IS
  'Staff-recorded study stage (10th, 11th, 12th, gap_year = finished Class 12). Same vocabulary as nexus_enrollments.current_standard; an active enrolment''s value wins for students. Written by Admin PATCH /api/crm/users/[id]/studies.';
COMMENT ON COLUMN public.users.twelfth_passed_year IS
  'Year a break-year student finished Class 12, recorded by staff in Admin. Only set with study_stage = gap_year.';

NOTIFY pgrst, 'reload schema';
