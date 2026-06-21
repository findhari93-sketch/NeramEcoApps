-- User lifecycle: reversible Archive + academic-year cohorts + verify-exam-status
-- Adds a focus dimension to the shared users table so old-batch users can be
-- de-prioritized (hidden from the default CRM view) WITHOUT being deleted and
-- WITHOUT disabling their login. Fully reversible. Suggestions only; no auto-act.

-- 1. New columns on users (idempotent, mirrors the is_disabled migration style)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active','archived')),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_by TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT NULL
    CHECK (academic_year IS NULL OR academic_year ~ '^[0-9]{4}-[0-9]{2}$'),
  ADD COLUMN IF NOT EXISTS exam_status TEXT DEFAULT NULL
    CHECK (exam_status IS NULL OR exam_status IN
      ('writing_exam_this_year','completed_exam','not_sure','not_writing'));

-- Partial index: archived rows are the minority, so index only those
CREATE INDEX IF NOT EXISTS idx_users_lifecycle_archived
  ON public.users (lifecycle_status) WHERE lifecycle_status = 'archived';

-- 2. Recreate the CRM view to expose the new columns (column list changes, so
--    CREATE OR REPLACE is not allowed). This reproduces the live definition
--    verbatim and adds: u.is_disabled, the 6 lifecycle/cohort fields, and
--    lp.target_exam_year. Keeps security_invoker, GRANTs, and pgrst reload.
DROP VIEW IF EXISTS public.user_journey_view;

CREATE VIEW public.user_journey_view
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.name,
  u.first_name,
  u.last_name,
  u.email,
  u.phone,
  u.avatar_url,
  u.user_type,
  u.status,
  u.phone_verified,
  u.email_verified,
  u.created_at,
  u.updated_at,
  u.last_login_at,
  u.preferred_language,
  u.linked_classroom_email,
  u.is_disabled,
  u.lifecycle_status,
  u.archived_at,
  u.archived_by,
  u.archived_reason,
  u.academic_year,
  u.exam_status,
  lp.id AS lead_profile_id,
  lp.application_number,
  lp.status AS application_status,
  lp.applicant_category,
  lp.interest_course,
  lp.selected_center_id,
  lp.learning_mode,
  lp.city,
  lp.state,
  lp.country,
  lp.pincode,
  lp.admin_notes,
  lp.reviewed_by,
  lp.reviewed_at,
  lp.assigned_fee,
  lp.final_fee,
  lp.payment_scheme,
  lp.form_step_completed,
  lp.created_at AS application_created_at,
  lp.contacted_status,
  lp.target_exam_year,
  COALESCE(demo.registration_count, 0) AS demo_registration_count,
  COALESCE(demo.has_demo_registration, false) AS has_demo_registration,
  demo.latest_demo_status,
  COALESCE(demo.demo_attended, false) AS demo_attended,
  COALESCE(demo.demo_survey_completed, false) AS demo_survey_completed,
  COALESCE(pay.total_paid, 0::numeric) AS total_paid,
  pay.latest_payment_status AS payment_status,
  COALESCE(pay.has_pending_payment, false) AS has_pending_payment,
  COALESCE(pay.payment_count, 0) AS payment_count,
  sp.id AS student_profile_id,
  sp.enrollment_date,
  sp.batch_id,
  sp.course_id AS student_course_id,
  os.status AS onboarding_status,
  os.completed_at AS onboarding_completed_at,
  COALESCE(os.questions_answered, 0) AS onboarding_questions_answered,
  CASE
    WHEN sp.id IS NOT NULL THEN 'enrolled'::text
    WHEN pay.total_paid > 0::numeric AND pay.latest_payment_status = 'paid'::payment_status THEN 'payment_complete'::text
    WHEN lp.status = 'approved'::application_status THEN 'admin_approved'::text
    WHEN lp.status = ANY (ARRAY['submitted'::application_status, 'under_review'::application_status, 'pending_verification'::application_status]) THEN 'application_submitted'::text
    WHEN demo.has_attended = true THEN 'demo_attended'::text
    WHEN demo.registration_count > 0 THEN 'demo_requested'::text
    WHEN u.phone_verified = true THEN 'phone_verified'::text
    ELSE 'new_lead'::text
  END AS pipeline_stage
FROM users u
  LEFT JOIN LATERAL (
    SELECT *
    FROM lead_profiles
    WHERE lead_profiles.user_id = u.id AND lead_profiles.deleted_at IS NULL
    ORDER BY lead_profiles.created_at DESC
    LIMIT 1
  ) lp ON true
  LEFT JOIN student_profiles sp ON sp.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS registration_count,
      true AS has_demo_registration,
      (SELECT dcr2.status FROM demo_class_registrations dcr2 WHERE dcr2.user_id = u.id ORDER BY dcr2.created_at DESC LIMIT 1) AS latest_demo_status,
      bool_or(dcr.attended = true) AS has_attended,
      bool_or(dcr.attended = true) AS demo_attended,
      bool_or(dcr.survey_completed = true) AS demo_survey_completed
    FROM demo_class_registrations dcr
    WHERE dcr.user_id = u.id
    HAVING count(*) > 0
  ) demo ON true
  LEFT JOIN LATERAL (
    SELECT
      sum(CASE WHEN p.status = 'paid'::payment_status THEN p.amount ELSE 0::numeric END) AS total_paid,
      (SELECT p2.status FROM payments p2 WHERE p2.user_id = u.id ORDER BY p2.created_at DESC LIMIT 1) AS latest_payment_status,
      bool_or(p.status = 'pending'::payment_status) AS has_pending_payment,
      count(*)::integer AS payment_count
    FROM payments p
    WHERE p.user_id = u.id
    HAVING count(*) > 0
  ) pay ON true
  LEFT JOIN onboarding_sessions os ON os.user_id = u.id
WHERE (u.user_type = ANY (ARRAY['lead'::user_type, 'student'::user_type])) AND u.firebase_uid IS NOT NULL;

GRANT SELECT ON public.user_journey_view TO anon, authenticated, service_role;

-- 3. One-time backfill of academic_year from the latest non-deleted lead_profile
--    per user. Correlated subquery avoids row multiplication for users with
--    multiple applications. Mapping: target_exam_year 2026 -> '2025-26'.
UPDATE public.users u
SET academic_year = (lp.target_exam_year - 1)::text || '-' || lpad((lp.target_exam_year % 100)::text, 2, '0')
FROM lead_profiles lp
WHERE lp.user_id = u.id
  AND lp.deleted_at IS NULL
  AND lp.target_exam_year IS NOT NULL
  AND u.academic_year IS NULL
  AND lp.id = (
    SELECT l2.id FROM lead_profiles l2
    WHERE l2.user_id = u.id AND l2.deleted_at IS NULL
    ORDER BY l2.created_at DESC
    LIMIT 1
  );

NOTIFY pgrst, 'reload schema';
