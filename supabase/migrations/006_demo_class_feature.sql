-- ============================================
-- Neram Classes - Demo Class Feature
-- Migration: 006_demo_class_feature.sql
-- Description: Demo class booking system with slots, registrations, and post-demo surveys
-- ============================================

-- ============================================
-- 1. NEW ENUMS
-- ============================================

-- Demo slot status
CREATE TYPE demo_slot_status AS ENUM (
  'draft',        -- Created but not visible to users
  'scheduled',    -- Open for registrations
  'confirmed',    -- Minimum registrations met, class confirmed
  'conducted',    -- Demo class completed
  'cancelled'     -- Cancelled by admin
);

-- Demo registration status
CREATE TYPE demo_registration_status AS ENUM (
  'pending',      -- Awaiting admin approval
  'approved',     -- Approved by admin
  'rejected',     -- Rejected by admin
  'attended',     -- Marked as attended
  'no_show',      -- Did not attend
  'cancelled'     -- Cancelled by user
);

-- Demo mode
CREATE TYPE demo_mode AS ENUM (
  'online',       -- Zoom/Teams/Google Meet
  'offline',      -- Physical classroom
  'hybrid'        -- Both options available
);

-- Enrollment interest (for survey)
CREATE TYPE enrollment_interest AS ENUM (
  'yes',          -- Definitely interested
  'maybe',        -- Need more information
  'no'            -- Not interested right now
);

-- ============================================
-- 2. DEMO CLASS SLOTS TABLE
-- Admin-created time slots for demo classes
-- ============================================
CREATE TABLE IF NOT EXISTS demo_class_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Slot Details
  title TEXT NOT NULL DEFAULT 'Free Demo Class',
  description TEXT,

  -- Scheduling
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,           -- e.g., '10:00:00' or '15:00:00'
  duration_minutes INTEGER NOT NULL DEFAULT 60,

  -- Capacity Management
  min_registrations INTEGER NOT NULL DEFAULT 10,
  max_registrations INTEGER NOT NULL DEFAULT 50,
  current_registrations INTEGER NOT NULL DEFAULT 0,

  -- Meeting Details (filled when slot is confirmed)
  meeting_link TEXT,
  meeting_password TEXT,
  venue_address TEXT,                -- For offline demos
  demo_mode demo_mode NOT NULL DEFAULT 'online',

  -- Status
  status demo_slot_status NOT NULL DEFAULT 'scheduled',

  -- Instructor
  instructor_name TEXT,
  instructor_id UUID REFERENCES users(id),

  -- Course association (optional)
  course_id UUID REFERENCES courses(id),

  -- Admin tracking
  created_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Notification tracking
  confirmation_notifications_sent BOOLEAN DEFAULT FALSE,
  reminder_24h_sent BOOLEAN DEFAULT FALSE,
  reminder_1h_sent BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for demo slots
CREATE INDEX idx_demo_slots_date ON demo_class_slots(slot_date);
CREATE INDEX idx_demo_slots_status ON demo_class_slots(status);
CREATE INDEX idx_demo_slots_upcoming ON demo_class_slots(slot_date, status)
  WHERE status IN ('scheduled', 'confirmed');
CREATE INDEX idx_demo_slots_date_time ON demo_class_slots(slot_date, slot_time);

-- ============================================
-- 3. DEMO CLASS REGISTRATIONS TABLE
-- User bookings for demo slots
-- ============================================
CREATE TABLE IF NOT EXISTS demo_class_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  slot_id UUID NOT NULL REFERENCES demo_class_slots(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Contact Info (required for all)
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,

  -- Student Context
  current_class TEXT,                -- '10th', '11th', '12th', '12th-pass'
  interest_course TEXT,              -- 'nata', 'jee_paper2', 'both'
  city TEXT,

  -- Status
  status demo_registration_status NOT NULL DEFAULT 'pending',

  -- Admin Processing
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Notification Tracking
  confirmation_email_sent BOOLEAN DEFAULT FALSE,
  confirmation_email_sent_at TIMESTAMPTZ,
  whatsapp_sent BOOLEAN DEFAULT FALSE,
  whatsapp_sent_at TIMESTAMPTZ,
  calendar_invite_sent BOOLEAN DEFAULT FALSE,
  reminder_24h_sent BOOLEAN DEFAULT FALSE,
  reminder_1h_sent BOOLEAN DEFAULT FALSE,

  -- Survey tracking
  survey_email_sent BOOLEAN DEFAULT FALSE,
  survey_email_sent_at TIMESTAMPTZ,
  survey_completed BOOLEAN DEFAULT FALSE,

  -- Attendance
  attended BOOLEAN,
  attendance_marked_at TIMESTAMPTZ,
  attendance_marked_by UUID REFERENCES users(id),

  -- Conversion tracking
  converted_to_lead BOOLEAN DEFAULT FALSE,
  lead_profile_id UUID REFERENCES lead_profiles(id),

  -- Source Tracking (UTM)
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referral_code TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate registrations for same slot
  UNIQUE(slot_id, phone)
);

-- Indexes for registrations
CREATE INDEX idx_demo_reg_slot ON demo_class_registrations(slot_id);
CREATE INDEX idx_demo_reg_user ON demo_class_registrations(user_id);
CREATE INDEX idx_demo_reg_phone ON demo_class_registrations(phone);
CREATE INDEX idx_demo_reg_status ON demo_class_registrations(status);
CREATE INDEX idx_demo_reg_pending ON demo_class_registrations(slot_id, status) WHERE status = 'pending';

-- ============================================
-- 4. DEMO CLASS SURVEYS TABLE
-- Post-demo feedback from attendees
-- ============================================
CREATE TABLE IF NOT EXISTS demo_class_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to registration
  registration_id UUID NOT NULL REFERENCES demo_class_registrations(id) ON DELETE CASCADE,

  -- Ratings (1-5 scale)
  overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
  teaching_rating INTEGER CHECK (teaching_rating >= 1 AND teaching_rating <= 5),

  -- Net Promoter Score (1-5 scale, where 5 = would definitely recommend)
  nps_score INTEGER CHECK (nps_score >= 1 AND nps_score <= 5),

  -- Open-ended feedback
  liked_most TEXT,
  suggestions TEXT,

  -- Enrollment interest
  enrollment_interest enrollment_interest,

  -- Additional feedback
  additional_comments TEXT,

  -- Contact preference for follow-up
  contact_for_followup BOOLEAN DEFAULT TRUE,

  submitted_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one survey per registration
  UNIQUE(registration_id)
);

-- Indexes for surveys
CREATE INDEX idx_demo_survey_registration ON demo_class_surveys(registration_id);
CREATE INDEX idx_demo_survey_enrollment_interest ON demo_class_surveys(enrollment_interest);

-- ============================================
-- 5. TRIGGERS
-- ============================================

-- Updated_at triggers
CREATE TRIGGER update_demo_class_slots_updated_at
  BEFORE UPDATE ON demo_class_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_demo_class_registrations_updated_at
  BEFORE UPDATE ON demo_class_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-increment/decrement registration count
CREATE OR REPLACE FUNCTION update_demo_slot_registration_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE demo_class_slots
    SET current_registrations = current_registrations + 1,
        updated_at = NOW()
    WHERE id = NEW.slot_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE demo_class_slots
    SET current_registrations = GREATEST(current_registrations - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.slot_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_demo_registration_count
  AFTER INSERT OR DELETE ON demo_class_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_demo_slot_registration_count();

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE demo_class_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_class_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_class_surveys ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access to demo_class_slots"
ON demo_class_slots FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to demo_class_registrations"
ON demo_class_registrations FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to demo_class_surveys"
ON demo_class_surveys FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public can view upcoming scheduled/confirmed slots
CREATE POLICY "Public can view upcoming demo slots"
ON demo_class_slots FOR SELECT
USING (
  status IN ('scheduled', 'confirmed')
  AND slot_date >= CURRENT_DATE
);

-- Public can insert survey responses (with valid registration)
CREATE POLICY "Public can submit surveys"
ON demo_class_surveys FOR INSERT
WITH CHECK (true);

-- ============================================
-- 7. EMAIL TEMPLATES FOR DEMO CLASS
-- ============================================

INSERT INTO email_templates (name, slug, subject, body_html, body_text, variables, is_active)
VALUES
(
  'Demo Class Registration Received',
  'demo-class-registration-received',
  '{"en": "Demo Class Registration Received - Neram Classes", "ta": "டெமோ வகுப்பு பதிவு பெறப்பட்டது - நேரம் வகுப்புகள்"}',
  '{"en": "<h1>Registration Received!</h1><p>Dear {{name}},</p><p>Thank you for registering for our free demo class.</p><p><strong>Date:</strong> {{date}}<br><strong>Time:</strong> {{time}}</p><p>Our team will review your registration and send you a confirmation shortly.</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "<h1>பதிவு பெறப்பட்டது!</h1><p>அன்புள்ள {{name}},</p><p>எங்கள் இலவச டெமோ வகுப்பிற்கு பதிவு செய்ததற்கு நன்றி.</p>"}',
  '{"en": "Thank you for registering for our demo class on {{date}} at {{time}}. We will confirm your registration soon.", "ta": ""}',
  ARRAY['name', 'date', 'time'],
  true
),
(
  'Demo Class Confirmation',
  'demo-class-confirmation',
  '{"en": "✅ Demo Class Confirmed - Neram Classes", "ta": "✅ டெமோ வகுப்பு உறுதிப்படுத்தப்பட்டது"}',
  '{"en": "<h1>Your Demo Class is Confirmed!</h1><p>Dear {{name}},</p><p>Great news! Your registration for the demo class has been approved.</p><p><strong>Date:</strong> {{date}}<br><strong>Time:</strong> {{time}}<br><strong>Duration:</strong> {{duration}} minutes</p>{{#if meeting_link}}<p><strong>Join Link:</strong> <a href=\"{{meeting_link}}\">{{meeting_link}}</a></p>{{/if}}{{#if venue_address}}<p><strong>Venue:</strong> {{venue_address}}</p>{{/if}}<p><a href=\"{{calendar_link}}\" style=\"background-color: #1565C0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 16px;\">Add to Calendar</a></p><p>We look forward to seeing you!</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  '{"en": "Your demo class is confirmed for {{date}} at {{time}}. {{#if meeting_link}}Join: {{meeting_link}}{{/if}}", "ta": ""}',
  ARRAY['name', 'date', 'time', 'duration', 'meeting_link', 'venue_address', 'calendar_link'],
  true
),
(
  'Demo Class Reminder 24h',
  'demo-class-reminder-24h',
  '{"en": "⏰ Demo Class Tomorrow - Neram Classes", "ta": "⏰ டெமோ வகுப்பு நாளை"}',
  '{"en": "<h1>Demo Class Tomorrow!</h1><p>Dear {{name}},</p><p>This is a friendly reminder that your demo class is <strong>tomorrow</strong>.</p><p><strong>Date:</strong> {{date}}<br><strong>Time:</strong> {{time}}</p>{{#if meeting_link}}<p><strong>Join Link:</strong> <a href=\"{{meeting_link}}\">{{meeting_link}}</a></p>{{/if}}<p>See you there!</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  '{"en": "Reminder: Your demo class is tomorrow at {{time}}. {{#if meeting_link}}Join: {{meeting_link}}{{/if}}", "ta": ""}',
  ARRAY['name', 'date', 'time', 'meeting_link'],
  true
),
(
  'Demo Class Reminder 1h',
  'demo-class-reminder-1h',
  '{"en": "🔔 Demo Class Starting Soon! - Neram Classes", "ta": "🔔 டெமோ வகுப்பு விரைவில் தொடங்குகிறது!"}',
  '{"en": "<h1>Starting in 1 Hour!</h1><p>Dear {{name}},</p><p>Your demo class starts in <strong>1 hour</strong>.</p>{{#if meeting_link}}<p><a href=\"{{meeting_link}}\" style=\"background-color: #4CAF50; color: white; padding: 16px 32px; text-decoration: none; border-radius: 4px; display: inline-block; font-size: 18px;\">Join Now</a></p>{{/if}}<p>See you soon!</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  '{"en": "Your demo class starts in 1 hour! {{#if meeting_link}}Join: {{meeting_link}}{{/if}}", "ta": ""}',
  ARRAY['name', 'meeting_link'],
  true
),
(
  'Demo Class Survey Request',
  'demo-class-survey',
  '{"en": "How was your Demo Class? - Neram Classes", "ta": "டெமோ வகுப்பு எப்படி இருந்தது?"}',
  '{"en": "<h1>How was your Demo Class?</h1><p>Dear {{name}},</p><p>Thank you for attending our demo class! We''d love to hear your feedback.</p><p>Your opinion helps us improve our teaching and serve you better.</p><p><a href=\"{{survey_link}}\" style=\"background-color: #1565C0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 16px;\">Share Your Feedback</a></p><p>It only takes 2 minutes!</p><p>Best regards,<br>Team Neram Classes</p>", "ta": "..."}',
  '{"en": "How was your demo class? Share your feedback: {{survey_link}}", "ta": ""}',
  ARRAY['name', 'survey_link'],
  true
),
(
  'Admin Demo Registration Alert',
  'admin-demo-registration',
  '{"en": "New Demo Registration: {{name}}", "ta": "புதிய டெமோ பதிவு: {{name}}"}',
  '{"en": "<h1>New Demo Class Registration</h1><p><strong>Name:</strong> {{name}}</p><p><strong>Phone:</strong> {{phone}}</p><p><strong>Email:</strong> {{email}}</p><p><strong>Demo Date:</strong> {{date}}</p><p><strong>Slot:</strong> {{time}}</p><p><strong>Current Class:</strong> {{current_class}}</p><p><strong>Interest:</strong> {{interest}}</p><p><a href=\"{{admin_link}}\">Review in Admin Panel</a></p>", "ta": "..."}',
  '{"en": "New demo registration from {{name}} ({{phone}}) for {{date}} at {{time}}", "ta": ""}',
  ARRAY['name', 'phone', 'email', 'date', 'time', 'current_class', 'interest', 'admin_link'],
  true
)
ON CONFLICT (slug) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  variables = EXCLUDED.variables,
  updated_at = NOW();

-- ============================================
-- 8. HELPER FUNCTION: Generate next N Sundays
-- ============================================

CREATE OR REPLACE FUNCTION get_next_sundays(count INTEGER DEFAULT 4)
RETURNS TABLE (sunday_date DATE) AS $$
DECLARE
  next_sunday DATE;
  i INTEGER := 0;
BEGIN
  -- Find next Sunday
  next_sunday := CURRENT_DATE + ((7 - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER) % 7);

  -- If today is Sunday, start from today
  IF EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN
    next_sunday := CURRENT_DATE;
  END IF;

  WHILE i < count LOOP
    sunday_date := next_sunday + (i * 7);
    RETURN NEXT;
    i := i + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- END OF MIGRATION
-- ============================================
