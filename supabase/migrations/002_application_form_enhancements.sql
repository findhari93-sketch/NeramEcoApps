-- ============================================
-- Neram Classes - Application Form Enhancements
-- Migration: 002_application_form_enhancements.sql
-- Description: Add tables for scholarship, cashback, documents, installments
-- ============================================

-- ============================================
-- 1. SCHOLARSHIP APPLICATIONS TABLE
-- For tracking 95% scholarship eligibility
-- ============================================
CREATE TABLE IF NOT EXISTS scholarship_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_profile_id UUID NOT NULL REFERENCES lead_profiles(id) ON DELETE CASCADE,

  -- School verification
  is_government_school BOOLEAN DEFAULT FALSE,
  government_school_years INTEGER DEFAULT 0,
  school_name TEXT,

  -- Document URLs (stored in Supabase Storage)
  school_id_card_url TEXT,
  income_certificate_url TEXT,

  -- Income verification
  is_low_income BOOLEAN DEFAULT FALSE,
  annual_income_range TEXT, -- '<1L', '1L-2.5L', '2.5L-5L', '>5L'

  -- Scholarship eligibility
  scholarship_percentage INTEGER DEFAULT 0, -- 0, 50, 75, 95
  eligibility_reason TEXT,

  -- Admin verification
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_scholarship_lead_profile ON scholarship_applications(lead_profile_id);
CREATE INDEX idx_scholarship_status ON scholarship_applications(verification_status);

-- ============================================
-- 2. CASHBACK CLAIMS TABLE
-- For YouTube, Instagram, and Direct Payment cashbacks
-- ============================================
CREATE TABLE IF NOT EXISTS cashback_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_profile_id UUID REFERENCES lead_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Cashback type and amount
  cashback_type TEXT NOT NULL CHECK (cashback_type IN ('youtube_subscription', 'instagram_follow', 'direct_payment')),
  amount DECIMAL(10,2) NOT NULL DEFAULT 50.00,

  -- YouTube verification data
  youtube_channel_subscribed BOOLEAN DEFAULT FALSE,
  youtube_verification_data JSONB, -- API response data
  youtube_verified_at TIMESTAMPTZ,

  -- Instagram verification data
  instagram_username TEXT,
  instagram_self_declared BOOLEAN DEFAULT FALSE,
  instagram_screenshot_url TEXT,

  -- Direct payment data
  payment_id UUID REFERENCES payments(id),

  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'processed', 'rejected', 'expired')),
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  processing_notes TEXT,

  -- Cashback transfer details
  cashback_phone TEXT, -- Phone number to send cashback
  cashback_upi_id TEXT,
  cashback_transferred_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one claim per type per lead
  UNIQUE(lead_profile_id, cashback_type)
);

-- Indexes
CREATE INDEX idx_cashback_user ON cashback_claims(user_id);
CREATE INDEX idx_cashback_lead ON cashback_claims(lead_profile_id);
CREATE INDEX idx_cashback_status ON cashback_claims(status);
CREATE INDEX idx_cashback_type ON cashback_claims(cashback_type);

-- ============================================
-- 3. APPLICATION DOCUMENTS TABLE
-- For storing all uploaded documents
-- ============================================
CREATE TABLE IF NOT EXISTS application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_profile_id UUID NOT NULL REFERENCES lead_profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),

  -- Document details
  document_type TEXT NOT NULL CHECK (document_type IN (
    'school_id_card',
    'income_certificate',
    'payment_screenshot',
    'aadhar_card',
    'marksheet',
    'photo',
    'signature',
    'other'
  )),
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER, -- in bytes
  mime_type TEXT,

  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,

  -- Metadata
  uploaded_from TEXT, -- 'web', 'mobile', 'admin'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_lead ON application_documents(lead_profile_id);
CREATE INDEX idx_documents_type ON application_documents(document_type);
CREATE INDEX idx_documents_verified ON application_documents(is_verified);

-- ============================================
-- 4. PAYMENT INSTALLMENTS TABLE
-- For tracking partial payment schemes
-- ============================================
CREATE TABLE IF NOT EXISTS payment_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_profile_id UUID NOT NULL REFERENCES lead_profiles(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id),

  -- Installment details
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,

  -- Reminder settings
  reminder_date DATE,
  reminder_sent BOOLEAN DEFAULT FALSE,
  reminder_sent_at TIMESTAMPTZ,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'waived')),
  paid_at TIMESTAMPTZ,
  paid_amount DECIMAL(10,2),

  -- Late fee if applicable
  late_fee DECIMAL(10,2) DEFAULT 0,
  late_fee_waived BOOLEAN DEFAULT FALSE,

  -- Notes
  admin_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique installment numbers per lead
  UNIQUE(lead_profile_id, installment_number)
);

-- Indexes
CREATE INDEX idx_installments_lead ON payment_installments(lead_profile_id);
CREATE INDEX idx_installments_status ON payment_installments(status);
CREATE INDEX idx_installments_due_date ON payment_installments(due_date);
CREATE INDEX idx_installments_reminder ON payment_installments(reminder_date) WHERE reminder_sent = FALSE;

-- ============================================
-- 5. SOURCE TRACKING TABLE
-- "How did you hear about us?"
-- ============================================
CREATE TABLE IF NOT EXISTS source_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_profile_id UUID NOT NULL REFERENCES lead_profiles(id) ON DELETE CASCADE UNIQUE,

  -- Source category
  source_category TEXT CHECK (source_category IN (
    'youtube',
    'instagram',
    'facebook',
    'google_search',
    'friend_referral',
    'school_visit',
    'newspaper',
    'hoarding',
    'whatsapp',
    'other'
  )),
  source_detail TEXT, -- Additional details

  -- Referral information
  friend_referral_name TEXT,
  friend_referral_phone TEXT,
  referral_code TEXT,

  -- Attribution
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_source_tracking_category ON source_tracking(source_category);

-- ============================================
-- 6. POST-ENROLLMENT DETAILS TABLE
-- Additional info collected after payment
-- ============================================
CREATE TABLE IF NOT EXISTS post_enrollment_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES users(id),

  -- Personal details
  caste_category TEXT CHECK (caste_category IN ('general', 'obc', 'sc', 'st', 'ews', 'other')),
  caste_certificate_url TEXT,

  -- Aadhar details
  aadhar_number TEXT,
  aadhar_verified BOOLEAN DEFAULT FALSE,
  aadhar_document_url TEXT,

  -- Parent/Guardian details
  father_name TEXT,
  father_phone TEXT,
  father_occupation TEXT,
  mother_name TEXT,
  mother_phone TEXT,
  mother_occupation TEXT,

  -- Emergency contact
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,

  -- Medical info (optional)
  blood_group TEXT,
  medical_conditions TEXT,

  -- Nexus (MS Teams) account
  nexus_account_created BOOLEAN DEFAULT FALSE,
  nexus_email TEXT,
  nexus_password_set BOOLEAN DEFAULT FALSE,
  nexus_created_at TIMESTAMPTZ,
  nexus_created_by UUID REFERENCES users(id),

  -- Form completion
  form_completed BOOLEAN DEFAULT FALSE,
  form_completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_post_enrollment_student ON post_enrollment_details(student_profile_id);

-- ============================================
-- 7. ALTER LEAD_PROFILES TABLE
-- Add new columns for enhanced workflow
-- ============================================

-- Payment scheme (full or installment)
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS payment_scheme TEXT DEFAULT 'full'
CHECK (payment_scheme IN ('full', 'installment'));

-- Payment deadline
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS payment_deadline DATE;

-- Installment reminder date
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS installment_reminder_date DATE;

-- Cashback tracking
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS total_cashback_eligible DECIMAL(10,2) DEFAULT 0;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS total_cashback_processed DECIMAL(10,2) DEFAULT 0;

-- Full payment discount
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS full_payment_discount DECIMAL(10,2) DEFAULT 0;

-- Form completion tracking
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS form_step_completed INTEGER DEFAULT 0;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS form_completed_at TIMESTAMPTZ;

-- Notification tracking
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;

-- ============================================
-- 8. ALTER PAYMENTS TABLE
-- Add screenshot verification support
-- ============================================

-- Screenshot URL for direct payment
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

-- Screenshot verification
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS screenshot_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Link to lead profile
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS lead_profile_id UUID REFERENCES lead_profiles(id);

-- Installment tracking
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS installment_number INTEGER;

-- Index for lead payments
CREATE INDEX IF NOT EXISTS idx_payments_lead ON payments(lead_profile_id);

-- ============================================
-- 9. TRIGGERS FOR UPDATED_AT
-- ============================================

-- Trigger function (if not exists from previous migration)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to new tables
CREATE TRIGGER update_scholarship_applications_updated_at
    BEFORE UPDATE ON scholarship_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cashback_claims_updated_at
    BEFORE UPDATE ON cashback_claims
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_application_documents_updated_at
    BEFORE UPDATE ON application_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_installments_updated_at
    BEFORE UPDATE ON payment_installments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_post_enrollment_details_updated_at
    BEFORE UPDATE ON post_enrollment_details
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on new tables
ALTER TABLE scholarship_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashback_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_enrollment_details ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to scholarship_applications"
ON scholarship_applications FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role has full access to cashback_claims"
ON cashback_claims FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role has full access to application_documents"
ON application_documents FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role has full access to payment_installments"
ON payment_installments FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role has full access to source_tracking"
ON source_tracking FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role has full access to post_enrollment_details"
ON post_enrollment_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- 11. STORAGE BUCKETS (Run in Supabase Dashboard)
-- ============================================
-- Note: Run these in Supabase Dashboard > Storage

-- CREATE BUCKET application-documents (public: false)
-- CREATE BUCKET payment-screenshots (public: false)
-- CREATE BUCKET student-photos (public: true)

-- ============================================
-- 12. ADDITIONAL EMAIL TEMPLATES
-- ============================================
INSERT INTO email_templates (name, slug, subject, body_html, variables, is_active)
VALUES
(
  'Payment Reminder',
  'payment-reminder',
  '{"en": "Payment Reminder - Neram Classes", "ta": "பணம் செலுத்த நினைவூட்டல் - நேரம் வகுப்புகள்"}',
  '{"en": "<h1>Payment Reminder</h1><p>Dear {{name}},</p><p>This is a friendly reminder that your payment of <strong>₹{{amount}}</strong> is due on <strong>{{due_date}}</strong>.</p><p>Course: {{course}}</p><p><a href=\"{{payment_link}}\" style=\"background-color: #1565C0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;\">Pay Now</a></p><p>If you have already made the payment, please ignore this email.</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "<h1>பணம் செலுத்த நினைவூட்டல்</h1><p>அன்புள்ள {{name}},</p><p>உங்கள் <strong>₹{{amount}}</strong> பணம் <strong>{{due_date}}</strong> அன்று செலுத்த வேண்டும்.</p>"}',
  ARRAY['name', 'amount', 'due_date', 'course', 'payment_link'],
  true
),
(
  'Second Installment Reminder',
  'installment-reminder',
  '{"en": "Second Installment Due - Neram Classes", "ta": "இரண்டாவது தவணை நினைவூட்டல்"}',
  '{"en": "<h1>Second Installment Due</h1><p>Dear {{name}},</p><p>Your second installment of <strong>₹{{amount}}</strong> for {{course}} is due on <strong>{{due_date}}</strong>.</p><p>Please make the payment to continue your classes without interruption.</p><p><a href=\"{{payment_link}}\">Pay Now</a></p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  ARRAY['name', 'amount', 'due_date', 'course', 'payment_link'],
  true
),
(
  'Cashback Processed',
  'cashback-processed',
  '{"en": "Cashback Credited! - Neram Classes", "ta": "பணத்திருப்பம் வரவு செய்யப்பட்டது!"}',
  '{"en": "<h1>🎉 Cashback Credited!</h1><p>Dear {{name}},</p><p>Great news! Your cashback of <strong>₹{{amount}}</strong> has been processed.</p><p>Our team will transfer the amount to your registered phone number ({{phone}}) within 24-48 hours.</p><p>Thank you for choosing Neram Classes!</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  ARRAY['name', 'amount', 'phone'],
  true
),
(
  'Scholarship Approved',
  'scholarship-approved',
  '{"en": "Scholarship Approved! - Neram Classes", "ta": "உதவித்தொகை அங்கீகரிக்கப்பட்டது!"}',
  '{"en": "<h1>🎓 Congratulations!</h1><p>Dear {{name}},</p><p>We are pleased to inform you that your scholarship application has been <strong>approved</strong>!</p><p>Scholarship: <strong>{{percentage}}% off</strong> on course fees</p><p>Original Fee: ₹{{original_fee}}<br>Scholarship Discount: ₹{{discount}}<br><strong>Your Fee: ₹{{final_fee}}</strong></p><p><a href=\"{{payment_link}}\">Proceed to Payment</a></p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  ARRAY['name', 'percentage', 'original_fee', 'discount', 'final_fee', 'payment_link'],
  true
),
(
  'Post-Payment Form',
  'post-payment-form',
  '{"en": "Complete Your Enrollment - Neram Classes", "ta": "உங்கள் சேர்க்கையை முடிக்கவும்"}',
  '{"en": "<h1>Almost There!</h1><p>Dear {{name}},</p><p>Thank you for your payment! To complete your enrollment, please fill out the remaining details.</p><p><a href=\"{{form_link}}\">Complete Enrollment Form</a></p><p>This will help us set up your student account and provide you with the best learning experience.</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  ARRAY['name', 'form_link'],
  true
)
ON CONFLICT (slug) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  variables = EXCLUDED.variables,
  updated_at = NOW();

-- ============================================
-- END OF MIGRATION
-- ============================================
