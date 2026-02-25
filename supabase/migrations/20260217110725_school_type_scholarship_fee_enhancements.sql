-- ============================================
-- Migration 010: School Type, Scholarship System, Fee Structure Enhancements
-- Description: Add school_type to applications, enhance scholarship workflow,
--   add fee structure payment options, and new notification events
-- ============================================

-- ============================================
-- 1. NEW ENUMS
-- ============================================

-- School type for applicants
CREATE TYPE school_type AS ENUM ('private_school', 'government_aided', 'government_school');

-- Scholarship application status (replaces simple verification_status)
CREATE TYPE scholarship_application_status AS ENUM (
  'not_eligible',
  'eligible_pending',
  'documents_submitted',
  'under_review',
  'approved',
  'rejected',
  'revision_requested'
);

-- ============================================
-- 2. LEAD PROFILES: Add school_type & scholarship fields
-- ============================================

ALTER TABLE lead_profiles ADD COLUMN IF NOT EXISTS school_type school_type;
ALTER TABLE lead_profiles ADD COLUMN IF NOT EXISTS scholarship_eligible BOOLEAN DEFAULT FALSE;
ALTER TABLE lead_profiles ADD COLUMN IF NOT EXISTS scholarship_opened_at TIMESTAMPTZ;
ALTER TABLE lead_profiles ADD COLUMN IF NOT EXISTS scholarship_opened_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_lead_profiles_school_type
  ON lead_profiles(school_type) WHERE school_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_profiles_scholarship_eligible
  ON lead_profiles(scholarship_eligible) WHERE scholarship_eligible = true;

-- ============================================
-- 3. SCHOLARSHIP APPLICATIONS: Enhance for full workflow
-- ============================================

-- Add user_id for direct user reference (in addition to lead_profile_id)
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add new scholarship status column (typed enum instead of text CHECK)
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS scholarship_status scholarship_application_status DEFAULT 'not_eligible';

-- Add document URLs
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS aadhar_card_url TEXT;
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS mark_sheet_url TEXT;

-- Add approved fee (admin sets this, default 5000)
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS approved_fee DECIMAL(10,2);

-- Add revision workflow fields
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS revision_notes TEXT;
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS revision_requested_by UUID REFERENCES users(id);

-- Add submission tracking
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Add admin review fields (if not already present from migration 002)
ALTER TABLE scholarship_applications ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_scholarship_app_user ON scholarship_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_scholarship_app_status_new ON scholarship_applications(scholarship_status);

-- RLS: Users can read their own scholarship applications
CREATE POLICY "Users can view own scholarship applications"
  ON scholarship_applications FOR SELECT
  USING (user_id = auth.uid());

-- RLS: Users can insert their own scholarship applications
CREATE POLICY "Users can create own scholarship applications"
  ON scholarship_applications FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS: Users can update their own scholarship applications (only certain statuses)
CREATE POLICY "Users can update own scholarship applications"
  ON scholarship_applications FOR UPDATE
  USING (user_id = auth.uid() AND scholarship_status IN ('eligible_pending', 'revision_requested'));

-- ============================================
-- 4. FEE STRUCTURES: Add payment option columns
-- ============================================

ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS single_payment_discount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS installment_1_amount DECIMAL(10,2);
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS installment_2_amount DECIMAL(10,2);
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS is_hidden_from_public BOOLEAN DEFAULT FALSE;

-- ============================================
-- 5. NOTIFICATION EVENT TYPE: Add scholarship events
-- ============================================

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'scholarship_opened';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'scholarship_submitted';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'scholarship_approved';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'scholarship_rejected';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'scholarship_revision_requested';

-- ============================================
-- 6. DOCUMENT TYPE: Add parents_income_certificate
-- ============================================
-- Note: aadhar_card already exists in document_type enum
-- income_certificate already exists as well
-- Adding parents_income_certificate as a distinct type
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'parents_income_certificate';

-- ============================================
-- 7. UPDATE USER JOURNEY VIEW
-- Add school_type and scholarship fields
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

  -- School type & scholarship (new in migration 010)
  lp.school_type,
  lp.scholarship_eligible,

  -- Scholarship application status (new in migration 010)
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

-- ============================================
-- 8. SEED FEE STRUCTURES WITH PAYMENT OPTIONS
-- Update existing fee structures to include installment data
-- ============================================

-- Set crash course as hidden from public
UPDATE fee_structures
SET is_hidden_from_public = true
WHERE program_type = 'crash_course';

-- Set payment options for year_long courses
-- 1-Year NATA: Full 30000, Single payment 25000 (5000 discount), Installments 16500 + 13500
UPDATE fee_structures
SET
  single_payment_discount = 5000,
  installment_1_amount = 16500,
  installment_2_amount = 13500
WHERE program_type = 'year_long' AND course_type = 'nata';

-- 1-Year JEE Paper 2 (same structure)
UPDATE fee_structures
SET
  single_payment_discount = 5000,
  installment_1_amount = 16500,
  installment_2_amount = 13500
WHERE program_type = 'year_long' AND course_type = 'jee_paper2';

-- 1-Year Both/Combo (if exists, similar structure)
UPDATE fee_structures
SET
  single_payment_discount = 5000,
  installment_1_amount = 16500,
  installment_2_amount = 13500
WHERE program_type = 'year_long' AND course_type = 'both';
