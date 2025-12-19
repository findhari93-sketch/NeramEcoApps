-- ============================================
-- NERAM CLASSES - DATABASE SCHEMA
-- Migration 001: Initial Schema
-- ============================================

-- Migration 001: Enums
CREATE TYPE user_type AS ENUM ('lead', 'student', 'teacher', 'admin');
CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected', 'active', 'inactive');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'refunded');
CREATE TYPE application_source AS ENUM ('website_form', 'app', 'referral', 'manual');
CREATE TYPE course_type AS ENUM ('nata', 'jee_paper2', 'both', 'revit');
CREATE TYPE exam_type AS ENUM ('NATA', 'JEE_PAPER_2', 'BOTH');

-- Migration 002: Users table (unified identity)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  avatar_url TEXT,

  -- External auth identifiers
  firebase_uid TEXT UNIQUE,
  ms_oid TEXT UNIQUE,
  google_id TEXT UNIQUE,

  -- Status
  user_type user_type DEFAULT 'lead',
  status user_status DEFAULT 'pending',
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,

  -- Preferences
  preferred_language TEXT DEFAULT 'en',

  -- Metadata
  last_login_at TIMESTAMPTZ,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 003: Lead profiles (application forms)
CREATE TABLE lead_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Source tracking
  source application_source DEFAULT 'website_form',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referral_code TEXT,

  -- Application data
  interest_course course_type,
  qualification TEXT,
  school_college TEXT,
  city TEXT,
  state TEXT,

  -- Full application form data
  application_data JSONB,

  -- Admin review
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  rejection_reason TEXT,

  -- Fee assignment
  assigned_fee DECIMAL(10,2),
  discount_amount DECIMAL(10,2) DEFAULT 0,
  coupon_code TEXT,
  final_fee DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 004: Courses
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  short_description TEXT,

  course_type course_type NOT NULL,
  duration_months INTEGER,
  total_lessons INTEGER DEFAULT 0,

  -- Pricing
  regular_fee DECIMAL(10,2) NOT NULL,
  discounted_fee DECIMAL(10,2),
  discount_valid_until TIMESTAMPTZ,

  -- Content
  syllabus TEXT,
  features TEXT[],

  -- SEO
  meta_title JSONB, -- {en: '', ta: '', hi: '', kn: '', ml: ''}
  meta_description JSONB,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 005: Batches
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  course_id UUID REFERENCES courses(id),

  start_date DATE NOT NULL,
  end_date DATE,

  -- Microsoft Teams
  ms_team_id TEXT,
  ms_team_name TEXT,

  -- Capacity
  capacity INTEGER DEFAULT 30,
  enrolled_count INTEGER DEFAULT 0,

  -- Schedule
  schedule JSONB, -- [{day: 'Monday', start_time: '10:00', end_time: '12:00'}]

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 006: Student profiles
CREATE TABLE student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Enrollment
  enrollment_date DATE DEFAULT CURRENT_DATE,
  batch_id UUID REFERENCES batches(id),
  course_id UUID REFERENCES courses(id),

  -- Microsoft Teams
  ms_teams_id TEXT,
  ms_teams_email TEXT,

  -- Payment
  payment_status payment_status DEFAULT 'pending',
  total_fee DECIMAL(10,2),
  fee_paid DECIMAL(10,2) DEFAULT 0,
  fee_due DECIMAL(10,2),
  next_payment_date DATE,

  -- Progress
  lessons_completed INTEGER DEFAULT 0,
  assignments_completed INTEGER DEFAULT 0,
  total_watch_time INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,

  -- Contacts
  parent_contact TEXT,
  emergency_contact TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 007: Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  student_profile_id UUID REFERENCES student_profiles(id),
  lead_profile_id UUID REFERENCES lead_profiles(id),

  -- Amount
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR',

  -- Payment method
  payment_method TEXT, -- 'razorpay', 'upi_screenshot', 'bank_transfer'

  -- Razorpay
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,

  -- UPI Screenshot
  screenshot_url TEXT,
  screenshot_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,

  -- Status
  status payment_status DEFAULT 'pending',

  -- Receipt
  receipt_number TEXT UNIQUE,
  receipt_url TEXT,

  -- Details
  description TEXT,
  metadata JSONB,

  -- Error tracking
  failure_code TEXT,
  failure_reason TEXT,

  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 008: Colleges (for tools)
CREATE TABLE colleges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,

  -- Location
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT,
  pincode TEXT,

  -- Classification
  type TEXT, -- 'government', 'private', 'deemed'
  affiliation TEXT,
  established_year INTEGER,

  -- Courses
  courses_offered TEXT[],
  intake_capacity INTEGER,

  -- Rankings
  nirf_rank INTEGER,
  rating DECIMAL(2,1),

  -- Fees
  annual_fee_min DECIMAL(10,2),
  annual_fee_max DECIMAL(10,2),

  -- Contact
  website TEXT,
  email TEXT,
  phone TEXT,

  -- Content
  description TEXT,
  facilities TEXT[],

  -- Media
  logo_url TEXT,
  images TEXT[],

  -- SEO
  meta_title TEXT,
  meta_description TEXT,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 009: Cutoff data
CREATE TABLE cutoff_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,

  year INTEGER NOT NULL,
  exam_type exam_type NOT NULL,
  round INTEGER DEFAULT 1,

  -- Category cutoffs
  general_cutoff DECIMAL(5,2),
  obc_cutoff DECIMAL(5,2),
  sc_cutoff DECIMAL(5,2),
  st_cutoff DECIMAL(5,2),
  ews_cutoff DECIMAL(5,2),

  -- Quota cutoffs
  state_quota_cutoff DECIMAL(5,2),
  all_india_cutoff DECIMAL(5,2),

  -- Seats
  seats_filled INTEGER,
  total_seats INTEGER,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 010: Exam centers
CREATE TABLE exam_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,

  -- Location
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT NOT NULL,
  pincode TEXT,

  -- Coordinates
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),

  -- Exam types
  exam_types exam_type[],

  -- Details
  capacity INTEGER,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  facilities TEXT[],

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 011: Tool usage logs
CREATE TABLE tool_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  session_id TEXT,

  tool_name TEXT NOT NULL,

  input_data JSONB,
  result_data JSONB,

  ip_address INET,
  user_agent TEXT,
  referrer TEXT,

  execution_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 012: Email templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,

  subject JSONB NOT NULL, -- {en: '', ta: '', ...}
  body_html JSONB NOT NULL,
  body_text JSONB,

  variables TEXT[], -- Required variables

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 013: Email logs
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES email_templates(id),
  user_id UUID REFERENCES users(id),

  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,

  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'

  resend_id TEXT,
  error_message TEXT,

  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 014: Coupons
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,

  discount_type TEXT NOT NULL, -- 'percentage', 'fixed'
  discount_value DECIMAL(10,2) NOT NULL,

  -- Validity
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,

  -- Usage limits
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,

  -- Restrictions
  applicable_courses course_type[],
  min_amount DECIMAL(10,2),

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 015: Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_ms_oid ON users(ms_oid);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_user_type ON users(user_type);

CREATE INDEX idx_lead_profiles_user_id ON lead_profiles(user_id);
CREATE INDEX idx_lead_profiles_status ON lead_profiles(user_id) WHERE reviewed_at IS NULL;

CREATE INDEX idx_student_profiles_user_id ON student_profiles(user_id);
CREATE INDEX idx_student_profiles_batch_id ON student_profiles(batch_id);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);

CREATE INDEX idx_colleges_state ON colleges(state);
CREATE INDEX idx_colleges_city ON colleges(city);

CREATE INDEX idx_cutoff_data_college_id ON cutoff_data(college_id);
CREATE INDEX idx_cutoff_data_year ON cutoff_data(year);

CREATE INDEX idx_exam_centers_state ON exam_centers(state);
CREATE INDEX idx_exam_centers_city ON exam_centers(city);

-- Migration 016: Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_usage_logs ENABLE ROW LEVEL SECURITY;

-- Public read access for tools data
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutoff_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON colleges FOR SELECT USING (is_active = true);
CREATE POLICY "Public read access" ON cutoff_data FOR SELECT USING (true);
CREATE POLICY "Public read access" ON exam_centers FOR SELECT USING (is_active = true);
CREATE POLICY "Public read access" ON courses FOR SELECT USING (is_active = true);

-- Service role has full access (for API routes)
CREATE POLICY "Service role full access" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON lead_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON student_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON payments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON colleges FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON cutoff_data FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON exam_centers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON courses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON batches FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON coupons FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON email_templates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON email_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON tool_usage_logs FOR ALL USING (auth.role() = 'service_role');

-- Migration 017: Functions
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_lead_profiles_updated_at BEFORE UPDATE ON lead_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_student_profiles_updated_at BEFORE UPDATE ON student_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_colleges_updated_at BEFORE UPDATE ON colleges FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Migration 018: Generate receipt number
CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1;

CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.receipt_number IS NULL THEN
    NEW.receipt_number = 'NRM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('receipt_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_receipt_number_trigger BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION generate_receipt_number();
