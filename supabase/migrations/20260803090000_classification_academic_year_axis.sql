-- Class and exam year: audit a third axis, and correct the capability names.
--
-- Phase one (20260802090000) gave nexus_enrollments two orthogonal axes: study
-- stage (current_standard) and participation status. Staff can now also set a
-- student's exam-year cohort from Nexus, which lives on users.academic_year.
--
-- Why the audit table takes a third axis rather than a new table: the three edits
-- are made by the same gesture on the same screen, and "who changed this student's
-- classification and why" has to read as one timeline. The academic_year rows
-- record a change to users.academic_year, NOT to the nexus_enrollments row they
-- are keyed by; enrollment_id and classroom_id are there to say which classroom
-- the staff member was working in when they made the change.
--
-- Context for the change itself: the public apply form's "Planning to Write Exam
-- In" answer never reached the database, because Number('2026-27') is NaN, so a
-- fallback stamped every applicant with the CURRENT cohort regardless of their
-- class. Three Class 11 students were therefore tagged as writing the exam this
-- year. Nothing is auto-corrected here; the app flags the disagreement and staff
-- fix it, so every correction is a deliberate, audited act.
--
-- No academic_year_source column on users: five existing write paths across admin,
-- marketing and the student app would all have to maintain it, and the pairing
-- check (class vs exam year) already identifies the bad rows without provenance.
-- This table carries the provenance from here on.

-- 1. Third axis on the audit trail ---------------------------------------------
-- The original CHECK was written inline, so Postgres named it for us.

ALTER TABLE public.nexus_enrollment_classification_events
  DROP CONSTRAINT IF EXISTS nexus_enrollment_classification_events_axis_check;

ALTER TABLE public.nexus_enrollment_classification_events
  ADD CONSTRAINT nexus_enrollment_classification_events_axis_check
  CHECK (axis IN ('study_stage', 'participation', 'academic_year'));

COMMENT ON TABLE public.nexus_enrollment_classification_events IS
  'Append-only audit of classification changes made from the Nexus students screen. One row per changed axis per write. study_stage and participation change nexus_enrollments.current_standard / participation_status. academic_year changes users.academic_year, which is per-user and global: it is visible in the admin CRM and narrows every exam-year filter across the ecosystem, so enrollment_id records only which classroom the change was made from.';

-- 2. Correct the capability names in the column comments -----------------------
-- coord.student.classify has been split, because setting a class is data entry a
-- teacher does after speaking to a student, while marking someone dormant drops
-- them out of every metric and every automated reminder. Same route, two
-- capabilities, so a visiting teacher can do the first and not the second.

COMMENT ON COLUMN nexus_enrollments.current_standard IS
  'Study stage: 10th | 11th | 12th | gap_year. gap_year means finished Class 12 and preparing full time, so their exam is THIS year, same as 12th; the UI labels it "Break Year". NULL means nobody has said yet, and is treated as an actionable gap by the students screen, never as a default. Orthogonal to participation_status. Set by any teaching staff (coord.student.stage). Paired with users.academic_year: in cohort C, 12th and gap_year expect C, 11th expects C+1, 10th expects C+2. The pair is NOT enforced, because a repeater or an early attempt is legitimate; a disagreement is surfaced for staff to confirm or fix.';

COMMENT ON COLUMN nexus_enrollments.current_standard_source IS
  'staff = a staff member set it deliberately (coord.student.stage). onboarding_backfill = copied from the student''s own approved nexus_student_onboarding answer by migration 20260802090000, and therefore still worth confirming.';

COMMENT ON COLUMN nexus_enrollments.dormant_by IS
  'Staff user who marked them dormant. Requires the coord.student.dormancy capability (manager or admin), which is deliberately narrower than the coord.student.stage capability that sets a class or exam year.';

-- 3. Reload the PostgREST schema cache ----------------------------------------
NOTIFY pgrst, 'reload schema';
