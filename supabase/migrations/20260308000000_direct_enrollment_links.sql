-- Migration: Direct Enrollment Links
-- Date: 2026-03-08
-- Purpose: Allow admins to generate shareable enrollment links for students who paid directly

-- ============================================
-- 1. ENUMS
-- ============================================

-- Status enum for direct enrollment links
DO $$ BEGIN
  CREATE TYPE direct_enrollment_link_status AS ENUM (
    'active',
    'used',
    'expired',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add 'direct_link' to application_source enum
ALTER TYPE application_source ADD VALUE IF NOT EXISTS 'direct_link';

-- ============================================
-- 2. DIRECT ENROLLMENT LINKS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS direct_enrollment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Unique token for the shareable link
  token TEXT NOT NULL UNIQUE,

  -- Admin who created this link
  created_by UUID NOT NULL REFERENCES users(id),

  -- Link status and expiry
  status direct_enrollment_link_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

  -- Student reference info (for admin tracking, before student uses the link)
  student_name TEXT NOT NULL,
  student_phone TEXT,
  student_email TEXT,

  -- Pre-selected course details
  course_id UUID REFERENCES courses(id),
  batch_id UUID REFERENCES batches(id),
  center_id UUID REFERENCES offline_centers(id),
  interest_course course_type NOT NULL,
  learning_mode learning_mode NOT NULL DEFAULT 'hybrid',

  -- Fee details
  total_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  final_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- Payment confirmation (already paid by student)
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer', -- bank_transfer, upi_direct, cash
  transaction_reference TEXT,
  payment_date DATE,

  -- Admin notes
  admin_notes TEXT,

  -- Payment proof attachment
  payment_proof_url TEXT,

  -- Usage tracking (filled when student completes enrollment)
  used_by UUID REFERENCES users(id),
  used_at TIMESTAMPTZ,
  lead_profile_id UUID REFERENCES lead_profiles(id),
  student_profile_id UUID REFERENCES student_profiles(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_direct_enrollment_links_token ON direct_enrollment_links(token);
CREATE INDEX IF NOT EXISTS idx_direct_enrollment_links_status ON direct_enrollment_links(status);
CREATE INDEX IF NOT EXISTS idx_direct_enrollment_links_created_by ON direct_enrollment_links(created_by);
CREATE INDEX IF NOT EXISTS idx_direct_enrollment_links_expires_at ON direct_enrollment_links(expires_at);

-- Updated_at trigger
CREATE OR REPLACE TRIGGER set_direct_enrollment_links_updated_at
  BEFORE UPDATE ON direct_enrollment_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 3. ADD passport_photo_url TO post_enrollment_details
-- ============================================

ALTER TABLE post_enrollment_details
  ADD COLUMN IF NOT EXISTS passport_photo_url TEXT;

-- ============================================
-- 4. RLS POLICIES
-- ============================================

ALTER TABLE direct_enrollment_links ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage direct enrollment links"
  ON direct_enrollment_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin'
    )
  );

-- Public can read active links by token (for validation)
CREATE POLICY "Anyone can validate active links by token"
  ON direct_enrollment_links
  FOR SELECT
  USING (status = 'active');

-- ============================================
-- 5. NOTIFICATION EVENT TYPE
-- ============================================

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'direct_enrollment_completed';
