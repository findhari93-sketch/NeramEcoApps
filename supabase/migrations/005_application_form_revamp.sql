-- ============================================
-- Neram Classes - Application Form Revamp
-- Migration: 005_application_form_revamp.sql
-- Description: Comprehensive overhaul of application form with 4 applicant categories,
--              offline centers, callback requests, pin code caching, and soft delete support
-- ============================================

-- ============================================
-- 1. NEW ENUMS
-- ============================================

-- Applicant categories for conditional form fields
CREATE TYPE applicant_category AS ENUM (
  'school_student',      -- Class 8-12 students
  'diploma_student',     -- Diploma college students
  'college_student',     -- Degree college students
  'working_professional' -- Working professionals or others
);

-- Application status with soft delete support
CREATE TYPE application_status AS ENUM (
  'draft',               -- Form started but not submitted
  'pending_verification', -- Submitted, awaiting phone verification
  'submitted',           -- Submitted and phone verified
  'under_review',        -- Admin is reviewing
  'approved',            -- Application approved
  'rejected',            -- Application rejected
  'deleted'              -- Soft deleted by user or admin
);

-- Location source tracking
CREATE TYPE location_source AS ENUM (
  'geolocation',  -- From browser geolocation API
  'pincode',      -- Auto-filled from pin code lookup
  'manual'        -- Manually entered by user
);

-- ============================================
-- 2. OFFLINE CENTERS TABLE
-- For hybrid learning center selection
-- ============================================
CREATE TABLE IF NOT EXISTS offline_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,

  -- Address
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT DEFAULT 'IN',
  pincode TEXT,

  -- Coordinates for map display
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),

  -- Google integration
  google_business_url TEXT,
  google_maps_url TEXT,
  google_place_id TEXT,

  -- Media
  photos JSONB DEFAULT '[]'::jsonb, -- Array of image URLs

  -- Facilities
  facilities TEXT[] DEFAULT '{}', -- ['AC', 'Parking', 'WiFi', 'Projector']

  -- Operating hours
  operating_hours JSONB DEFAULT '{}'::jsonb,
  -- { "monday": { "open": "09:00", "close": "18:00" }, ... }

  -- Preferred visiting times for prospective students
  preferred_visit_times TEXT[] DEFAULT '{}',
  -- ['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM']

  -- Contact info
  contact_phone TEXT,
  contact_email TEXT,

  -- Capacity
  capacity INTEGER,
  current_students INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_offline_centers_city ON offline_centers(city);
CREATE INDEX idx_offline_centers_state ON offline_centers(state);
CREATE INDEX idx_offline_centers_active ON offline_centers(is_active) WHERE is_active = TRUE;

-- ============================================
-- 3. CENTER VISIT BOOKINGS TABLE
-- For scheduling center visits
-- ============================================
CREATE TABLE IF NOT EXISTS center_visit_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES offline_centers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),

  -- Visitor details (for non-logged-in users)
  visitor_name TEXT NOT NULL,
  visitor_phone TEXT NOT NULL,
  visitor_email TEXT,

  -- Booking details
  visit_date DATE NOT NULL,
  visit_time_slot TEXT NOT NULL, -- '10:00 AM - 12:00 PM'
  purpose TEXT, -- 'Tour', 'Demo Class', 'Fee Discussion'

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),

  -- Admin handling
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  admin_notes TEXT,

  -- Follow-up
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_visit_bookings_center ON center_visit_bookings(center_id);
CREATE INDEX idx_visit_bookings_date ON center_visit_bookings(visit_date);
CREATE INDEX idx_visit_bookings_status ON center_visit_bookings(status);

-- ============================================
-- 4. CALLBACK REQUESTS TABLE
-- For users who prefer to be called back
-- ============================================
CREATE TABLE IF NOT EXISTS callback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),

  -- Contact info
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,

  -- Preferred time
  preferred_date DATE,
  preferred_slot TEXT CHECK (preferred_slot IN ('morning', 'afternoon', 'evening')),
  -- morning: 9am-12pm, afternoon: 12pm-5pm, evening: 5pm-8pm
  timezone TEXT DEFAULT 'Asia/Kolkata',

  -- Interest
  course_interest course_type,
  query_type TEXT, -- 'fee_inquiry', 'course_details', 'admission_process', 'other'
  notes TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'attempted', 'completed', 'cancelled')),

  -- Admin handling
  assigned_to UUID REFERENCES users(id),
  scheduled_at TIMESTAMPTZ,
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  call_notes TEXT,
  call_outcome TEXT, -- 'interested', 'not_interested', 'follow_up', 'no_answer', 'wrong_number'

  -- Link to lead if form submitted later
  lead_profile_id UUID REFERENCES lead_profiles(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_callback_requests_status ON callback_requests(status);
CREATE INDEX idx_callback_requests_user ON callback_requests(user_id);
CREATE INDEX idx_callback_requests_assigned ON callback_requests(assigned_to);
CREATE INDEX idx_callback_requests_scheduled ON callback_requests(scheduled_at) WHERE status = 'scheduled';

-- ============================================
-- 5. PIN CODE CACHE TABLE
-- Cache for pin code lookups to reduce API calls
-- ============================================
CREATE TABLE IF NOT EXISTS pin_code_cache (
  pincode TEXT PRIMARY KEY,
  country TEXT NOT NULL DEFAULT 'IN',

  -- Location data
  city TEXT,
  district TEXT,
  state TEXT,
  region TEXT,

  -- Raw API response for reference
  raw_data JSONB,

  -- Multiple locations for same pincode
  locations JSONB DEFAULT '[]'::jsonb,
  -- [{ "name": "Area 1", "district": "...", "state": "..." }, ...]

  -- Cache management
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  hit_count INTEGER DEFAULT 1,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for expiry cleanup
CREATE INDEX idx_pin_code_cache_expires ON pin_code_cache(expires_at);

-- ============================================
-- 6. APPLICATION DELETIONS TABLE
-- Audit trail for soft deleted applications
-- ============================================
CREATE TABLE IF NOT EXISTS application_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_profile_id UUID NOT NULL REFERENCES lead_profiles(id),

  -- Who deleted
  deleted_by UUID REFERENCES users(id), -- null if self-deleted
  deletion_type TEXT NOT NULL CHECK (deletion_type IN ('user_requested', 'admin_deleted', 'duplicate', 'spam', 'test_data')),

  -- Reason
  deletion_reason TEXT NOT NULL,

  -- Timestamps
  deleted_at TIMESTAMPTZ DEFAULT NOW(),

  -- Restoration
  can_restore BOOLEAN DEFAULT TRUE,
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES users(id),
  restoration_notes TEXT
);

-- Indexes
CREATE INDEX idx_application_deletions_lead ON application_deletions(lead_profile_id);
CREATE INDEX idx_application_deletions_deleted_at ON application_deletions(deleted_at);

-- ============================================
-- 7. ALTER LEAD_PROFILES TABLE
-- Add new columns for enhanced form
-- ============================================

-- Application number (auto-generated unique identifier)
CREATE SEQUENCE IF NOT EXISTS application_number_seq START 1;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS application_number TEXT UNIQUE;

-- Father's name (replacing last_name concept for Indian context)
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS father_name TEXT;

-- Applicant category for conditional form fields
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS applicant_category applicant_category;

-- Location fields
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'IN';

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS pincode TEXT;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS district TEXT;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS location_source TEXT CHECK (location_source IN ('geolocation', 'pincode', 'manual'));

-- Academic data (JSONB for category-specific fields)
-- Structure varies by applicant_category:
-- school_student: { current_class, school_name, school_place_id, board, previous_percentage }
-- diploma_student: { college_name, college_place_id, department, completed_grade, marks }
-- college_student: { college_name, college_place_id, department, year_of_study, 12th_year, 12th_percentage, reason_for_exam }
-- working_professional: { 12th_year, occupation }
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS academic_data JSONB DEFAULT '{}'::jsonb;

-- Caste category (common for all applicants)
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS caste_category TEXT CHECK (caste_category IN ('general', 'obc', 'sc', 'st', 'ews'));

-- Target exam year
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS target_exam_year INTEGER;

-- Course selection (linked to courses table)
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS selected_course_id UUID REFERENCES courses(id);

-- Offline center selection
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS selected_center_id UUID REFERENCES offline_centers(id);

-- Hybrid learning acceptance
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS hybrid_learning_accepted BOOLEAN DEFAULT FALSE;

-- Application status (replaces simple reviewed_at check)
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS status application_status DEFAULT 'draft';

-- Phone verification tracking (separate from user-level)
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

-- Soft delete fields
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- New indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_lead_profiles_status ON lead_profiles(status);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_applicant_category ON lead_profiles(applicant_category);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_application_number ON lead_profiles(application_number);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_deleted ON lead_profiles(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_profiles_pincode ON lead_profiles(pincode);

-- ============================================
-- 8. ENHANCE COURSES TABLE FOR ADMIN CONTROL
-- ============================================

-- Add fields if not exist
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS course_category TEXT DEFAULT 'entrance_exam' CHECK (course_category IN ('entrance_exam', 'training', 'workshop'));

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS target_audience TEXT; -- 'school_students', 'college_students', 'professionals'

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS enrollment_open BOOLEAN DEFAULT TRUE;

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS enrollment_deadline DATE;

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS max_students INTEGER;

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS current_students INTEGER DEFAULT 0;

-- ============================================
-- 9. TRIGGER FOR APPLICATION NUMBER
-- ============================================

CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate application number only when status changes to 'submitted' and it's not already set
  IF NEW.status = 'submitted' AND NEW.application_number IS NULL THEN
    NEW.application_number := 'NERAM-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(NEXTVAL('application_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS generate_application_number_trigger ON lead_profiles;

CREATE TRIGGER generate_application_number_trigger
  BEFORE INSERT OR UPDATE ON lead_profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_application_number();

-- ============================================
-- 10. TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE TRIGGER update_offline_centers_updated_at
  BEFORE UPDATE ON offline_centers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_center_visit_bookings_updated_at
  BEFORE UPDATE ON center_visit_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_callback_requests_updated_at
  BEFORE UPDATE ON callback_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 11. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on new tables
ALTER TABLE offline_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_visit_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE callback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_code_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_deletions ENABLE ROW LEVEL SECURITY;

-- Public read access for offline centers (they're public information)
CREATE POLICY "Public read access to active offline centers"
ON offline_centers FOR SELECT
USING (is_active = TRUE);

-- Service role has full access
CREATE POLICY "Service role full access to offline_centers"
ON offline_centers FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to center_visit_bookings"
ON center_visit_bookings FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to callback_requests"
ON callback_requests FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to pin_code_cache"
ON pin_code_cache FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to application_deletions"
ON application_deletions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public read access for pin code cache (reduces API calls)
CREATE POLICY "Public read access to pin_code_cache"
ON pin_code_cache FOR SELECT
USING (expires_at > NOW());

-- ============================================
-- 12. EMAIL TEMPLATES FOR NEW WORKFLOWS
-- ============================================

INSERT INTO email_templates (name, slug, subject, body_html, variables, is_active)
VALUES
(
  'Application Submitted',
  'application-submitted',
  '{"en": "Application Received - Neram Classes (#{{application_number}})", "ta": "விண்ணப்பம் பெறப்பட்டது - நேரம் வகுப்புகள் (#{{application_number}})"}',
  '{"en": "<h1>Application Received!</h1><p>Dear {{name}},</p><p>Thank you for submitting your application to Neram Classes.</p><p><strong>Application Number:</strong> {{application_number}}</p><p><strong>Course:</strong> {{course}}</p><p><strong>What happens next?</strong></p><ul><li>Our team will review your application within 24-48 hours</li><li>You will receive an email once your application is approved</li><li>You can track your application status in your dashboard</li></ul><p>If you have any questions, feel free to reach out to us.</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "<h1>விண்ணப்பம் பெறப்பட்டது!</h1><p>அன்புள்ள {{name}},</p><p>நேரம் வகுப்புகளுக்கு உங்கள் விண்ணப்பத்திற்கு நன்றி.</p><p><strong>விண்ணப்ப எண்:</strong> {{application_number}}</p>"}',
  ARRAY['name', 'application_number', 'course'],
  true
),
(
  'Application Under Review',
  'application-under-review',
  '{"en": "Application Under Review - Neram Classes (#{{application_number}})", "ta": "விண்ணப்பம் மதிப்பாய்வில் உள்ளது"}',
  '{"en": "<h1>Application Under Review</h1><p>Dear {{name}},</p><p>Your application (#{{application_number}}) is now being reviewed by our team.</p><p>We will notify you once a decision is made.</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  ARRAY['name', 'application_number'],
  true
),
(
  'Application Approved',
  'application-approved',
  '{"en": "🎉 Application Approved - Neram Classes (#{{application_number}})", "ta": "🎉 விண்ணப்பம் அங்கீகரிக்கப்பட்டது"}',
  '{"en": "<h1>🎉 Congratulations!</h1><p>Dear {{name}},</p><p>Your application (#{{application_number}}) has been <strong>approved</strong>!</p><p><strong>Next Steps:</strong></p><ol><li>Complete payment to confirm your seat</li><li>Your fee: ₹{{fee}}</li><li>Payment deadline: {{deadline}}</li></ol><p><a href=\"{{payment_link}}\" style=\"background-color: #1565C0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;\">Proceed to Payment</a></p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  ARRAY['name', 'application_number', 'fee', 'deadline', 'payment_link'],
  true
),
(
  'Callback Scheduled',
  'callback-scheduled',
  '{"en": "Callback Scheduled - Neram Classes", "ta": "திரும்ப அழைக்க திட்டமிடப்பட்டது"}',
  '{"en": "<h1>Callback Scheduled</h1><p>Dear {{name}},</p><p>As requested, our team will call you on:</p><p><strong>Date:</strong> {{date}}<br><strong>Time:</strong> {{time_slot}}</p><p>Please ensure your phone ({{phone}}) is reachable during this time.</p><p>If you need to reschedule, please contact us.</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  ARRAY['name', 'date', 'time_slot', 'phone'],
  true
),
(
  'Center Visit Confirmed',
  'center-visit-confirmed',
  '{"en": "Center Visit Confirmed - Neram Classes", "ta": "மையத்திற்கு வருகை உறுதி செய்யப்பட்டது"}',
  '{"en": "<h1>Visit Confirmed!</h1><p>Dear {{name}},</p><p>Your visit to our center has been confirmed:</p><p><strong>Center:</strong> {{center_name}}<br><strong>Address:</strong> {{center_address}}<br><strong>Date:</strong> {{visit_date}}<br><strong>Time:</strong> {{visit_time}}</p><p><a href=\"{{directions_link}}\">Get Directions</a></p><p>We look forward to seeing you!</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  ARRAY['name', 'center_name', 'center_address', 'visit_date', 'visit_time', 'directions_link'],
  true
),
(
  'Admin New Application Alert',
  'admin-new-application',
  '{"en": "New Application: {{name}} - {{application_number}}", "ta": "புதிய விண்ணப்பம்: {{name}}"}',
  '{"en": "<h1>New Application Received</h1><p><strong>Application #:</strong> {{application_number}}</p><p><strong>Name:</strong> {{name}}</p><p><strong>Phone:</strong> {{phone}}</p><p><strong>Email:</strong> {{email}}</p><p><strong>Course:</strong> {{course}}</p><p><strong>Category:</strong> {{category}}</p><p><strong>Location:</strong> {{city}}, {{state}}</p><p><a href=\"{{admin_link}}\">Review Application</a></p>", "ta": "..."}',
  ARRAY['application_number', 'name', 'phone', 'email', 'course', 'category', 'city', 'state', 'admin_link'],
  true
)
ON CONFLICT (slug) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  variables = EXCLUDED.variables,
  updated_at = NOW();

-- ============================================
-- 13. SEED DATA FOR BOARDS
-- ============================================

-- Create boards lookup table if needed (or store in application_data)
CREATE TABLE IF NOT EXISTS education_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT,
  country TEXT DEFAULT 'IN',
  states TEXT[], -- States where this board is prevalent
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0
);

INSERT INTO education_boards (code, name, full_name, states, display_order)
VALUES
  ('cbse', 'CBSE', 'Central Board of Secondary Education', ARRAY['All India'], 1),
  ('icse', 'ICSE', 'Indian Certificate of Secondary Education', ARRAY['All India'], 2),
  ('state_tn', 'State Board (TN)', 'Tamil Nadu State Board', ARRAY['Tamil Nadu'], 3),
  ('matriculation', 'Matriculation', 'Tamil Nadu Matriculation Board', ARRAY['Tamil Nadu'], 4),
  ('state_ka', 'State Board (KA)', 'Karnataka State Board', ARRAY['Karnataka'], 5),
  ('state_ap', 'State Board (AP)', 'Andhra Pradesh State Board', ARRAY['Andhra Pradesh', 'Telangana'], 6),
  ('state_ke', 'State Board (KE)', 'Kerala State Board', ARRAY['Kerala'], 7),
  ('ib', 'IB', 'International Baccalaureate', ARRAY['All India'], 8),
  ('igcse', 'IGCSE', 'Cambridge IGCSE', ARRAY['All India'], 9),
  ('nios', 'NIOS', 'National Institute of Open Schooling', ARRAY['All India'], 10),
  ('other', 'Other', 'Other Board', ARRAY['All India'], 99)
ON CONFLICT (code) DO NOTHING;

-- Enable RLS
ALTER TABLE education_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to education_boards"
ON education_boards FOR SELECT
USING (is_active = TRUE);

CREATE POLICY "Service role full access to education_boards"
ON education_boards FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- END OF MIGRATION
-- ============================================
