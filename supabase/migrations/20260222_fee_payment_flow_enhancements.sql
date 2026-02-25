-- ============================================
-- Fee Payment Flow Enhancements
-- Migration: Add allowed_payment_modes, installment config,
--            and user-specific coupon support
-- ============================================

-- ============================================
-- 1. NEW COLUMNS ON lead_profiles
-- ============================================

-- What payment options the admin allows the student to see
-- Separate from payment_scheme which is the student's actual choice
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS allowed_payment_modes TEXT DEFAULT 'full_and_installment'
    CHECK (allowed_payment_modes IN ('full_only', 'full_and_installment'));

-- Admin-configurable installment amounts (instead of hardcoded 50/50 split)
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS installment_1_amount DECIMAL(10,2);

ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS installment_2_amount DECIMAL(10,2);

-- Days until 2nd installment is due (default 45)
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS installment_2_due_days INT DEFAULT 45;

-- Link to admin-generated coupon for this student
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS admin_coupon_id UUID REFERENCES coupons(id);

-- ============================================
-- 2. NEW COLUMNS ON coupons (user-specific coupons)
-- ============================================

-- Make a coupon user-specific (NULL = general coupon anyone can use)
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS lead_profile_id UUID REFERENCES lead_profiles(id);

-- Track which admin created the coupon
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Description/reason for the coupon
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Index for quick lookup of coupons by lead profile
CREATE INDEX IF NOT EXISTS idx_coupons_lead_profile
  ON coupons(lead_profile_id) WHERE lead_profile_id IS NOT NULL;

-- ============================================
-- 3. UPDATE USER JOURNEY VIEW
-- Add new fee payment fields
-- ============================================

CREATE OR REPLACE VIEW public.user_journey_view AS
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

  -- School type & scholarship
  lp.school_type,
  lp.scholarship_eligible,

  -- Fee payment flow (new)
  lp.allowed_payment_modes,
  lp.installment_1_amount,
  lp.installment_2_amount,
  lp.installment_2_due_days,
  lp.admin_coupon_id,
  lp.full_payment_discount,
  lp.coupon_code,

  -- Scholarship application status
  sa.scholarship_status,

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

-- Scholarship application (linked to lead profile)
LEFT JOIN LATERAL (
  SELECT sa2.scholarship_status
  FROM scholarship_applications sa2
  WHERE sa2.lead_profile_id = lp.id
  ORDER BY sa2.created_at DESC
  LIMIT 1
) sa ON lp.id IS NOT NULL

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
LEFT JOIN onboarding_sessions os ON os.user_id = u.id;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
