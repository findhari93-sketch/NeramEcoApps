-- Application forms: fill class and exam year from them, and remember which
-- suggested form staff said belongs to someone else.
--
-- Why this exists. A student reaches Nexus through Admin's enrol, Nexus Add or
-- Nexus Create account, and none of the three reads the application form. On
-- 2026-09-11, 16 of 42 students in the live classroom had no class and 14 had no
-- exam year, although most of them had given both on the form. Two things stood
-- in the way:
--
--   1. Nothing copied the answers across. Only a manual review sheet did, and a
--      single past exam year in it failed the whole apply.
--   2. The form usually sits on a DIFFERENT users row. The public apply form signs
--      the student in by phone and makes a row named "User" (the typed name goes
--      to first_name). The Microsoft account is made later by hand, with no phone,
--      on a second row, and nothing joins the two.
--
-- Nexus now proposes the matching form, a staff member confirms, merge_user_records
-- joins the rows, and whatever is still missing is filled from the linked form.
-- That needs three schema changes:
--
--   a. current_standard_source = 'application', so a class copied off a form reads
--      differently from one staff decided.
--   b. performed_by may be NULL on the classification audit, meaning "filled by the
--      daily application-form pass". Every change a person makes still names them.
--   c. nexus_application_form_dismissals, so a form staff rejected is not offered
--      again to the next teacher.

-- 1. A third source for the study stage ----------------------------------------

ALTER TABLE nexus_enrollments
  DROP CONSTRAINT IF EXISTS nexus_enrollments_current_standard_source_check;

ALTER TABLE nexus_enrollments
  ADD CONSTRAINT nexus_enrollments_current_standard_source_check
  CHECK (current_standard_source IS NULL
         OR current_standard_source IN ('staff', 'onboarding_backfill', 'application'));

COMMENT ON COLUMN nexus_enrollments.current_standard_source IS
  'staff = a staff member set it deliberately (coord.student.stage). onboarding_backfill = copied from the student''s own approved nexus_student_onboarding answer by migration 20260802090000. application = copied from the class on the student''s own application form (lead_profiles.academic_data.current_class or applicant_category), by the daily application-form pass or when staff linked the form. Both copied sources are still worth confirming.';

-- 2. Automatic writes have no author -------------------------------------------

ALTER TABLE public.nexus_enrollment_classification_events
  ALTER COLUMN performed_by DROP NOT NULL;

COMMENT ON COLUMN public.nexus_enrollment_classification_events.performed_by IS
  'Staff member who made the change. NULL only for the automatic application-form fill (api/cron/application-fill), whose reason says so.';

-- 3. Forms staff said are not this student -------------------------------------
-- Keyed by the pair. Both columns reference users, so merge_user_records repoints
-- them like every other user reference (its _user_ref_columns view reads foreign
-- keys). Service-role only: RLS on with no policy, the default deny.

CREATE TABLE IF NOT EXISTS public.nexus_application_form_dismissals (
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  form_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  dismissed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, form_user_id)
);

COMMENT ON TABLE public.nexus_application_form_dismissals IS
  'A suggested application form that staff said does not belong to the student. student_id is the Nexus student, form_user_id the users row holding the form. The Students screen never proposes a dismissed pair again.';

ALTER TABLE public.nexus_application_form_dismissals ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
