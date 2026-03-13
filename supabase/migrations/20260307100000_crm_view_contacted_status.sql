-- Migration: Add contacted_status to user_journey_view
-- Required for Dead Lead filtering in CRM list
-- Date: 2026-03-07

DROP VIEW IF EXISTS public.user_journey_view;

CREATE VIEW public.user_journey_view AS
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

  -- Lead profile fields (most recent non-deleted)
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

  -- Demo class aggregation
  COALESCE(demo.registration_count, 0)::int AS demo_registration_count,
  COALESCE(demo.has_demo_registration, false) AS has_demo_registration,
  demo.latest_demo_status,
  COALESCE(demo.demo_attended, false) AS demo_attended,
  COALESCE(demo.demo_survey_completed, false) AS demo_survey_completed,

  -- Payment aggregation
  COALESCE(pay.total_paid, 0)::numeric AS total_paid,
  pay.latest_payment_status AS payment_status,
  COALESCE(pay.has_pending_payment, false) AS has_pending_payment,
  COALESCE(pay.payment_count, 0)::int AS payment_count,

  -- Student profile
  sp.id AS student_profile_id,
  sp.enrollment_date,
  sp.batch_id,
  sp.course_id AS student_course_id,

  -- Onboarding
  os.status AS onboarding_status,
  os.completed_at AS onboarding_completed_at,
  COALESCE(os.questions_answered, 0)::int AS onboarding_questions_answered,

  -- Computed pipeline stage (highest reached, non-linear)
  CASE
    WHEN sp.id IS NOT NULL THEN 'enrolled'
    WHEN pay.total_paid > 0 AND pay.latest_payment_status = 'paid' THEN 'payment_complete'
    WHEN lp.status = 'approved' THEN 'admin_approved'
    WHEN lp.status IN ('submitted', 'under_review', 'pending_verification') THEN 'application_submitted'
    WHEN demo.has_attended = true THEN 'demo_attended'
    WHEN demo.registration_count > 0 THEN 'demo_requested'
    WHEN u.phone_verified = true THEN 'phone_verified'
    ELSE 'new_lead'
  END AS pipeline_stage

FROM users u

-- Most recent non-deleted lead profile
LEFT JOIN LATERAL (
  SELECT *
  FROM lead_profiles
  WHERE lead_profiles.user_id = u.id
    AND lead_profiles.deleted_at IS NULL
  ORDER BY lead_profiles.created_at DESC
  LIMIT 1
) lp ON true

-- Student profile
LEFT JOIN student_profiles sp ON sp.user_id = u.id

-- Demo class registration aggregation
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS registration_count,
    true AS has_demo_registration,
    (
      SELECT dcr2.status
      FROM demo_class_registrations dcr2
      WHERE dcr2.user_id = u.id
      ORDER BY dcr2.created_at DESC
      LIMIT 1
    ) AS latest_demo_status,
    BOOL_OR(dcr.attended = true) AS has_attended,
    BOOL_OR(dcr.attended = true) AS demo_attended,
    BOOL_OR(dcr.survey_completed = true) AS demo_survey_completed
  FROM demo_class_registrations dcr
  WHERE dcr.user_id = u.id
  HAVING COUNT(*) > 0
) demo ON true

-- Payment aggregation
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END) AS total_paid,
    (
      SELECT p2.status
      FROM payments p2
      WHERE p2.user_id = u.id
      ORDER BY p2.created_at DESC
      LIMIT 1
    ) AS latest_payment_status,
    BOOL_OR(p.status = 'pending') AS has_pending_payment,
    COUNT(*)::int AS payment_count
  FROM payments p
  WHERE p.user_id = u.id
  HAVING COUNT(*) > 0
) pay ON true

-- Onboarding session
LEFT JOIN onboarding_sessions os ON os.user_id = u.id

-- Only include leads and students in the CRM pipeline
WHERE u.user_type IN ('lead', 'student');

-- Re-grant permissions after view recreation
GRANT SELECT ON public.user_journey_view TO anon, authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
