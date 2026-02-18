-- ============================================
-- Migration 007: Onboarding, Fee Structures, Notifications
-- ============================================
-- Adds:
-- 1. onboarding_questions - Admin-configurable onboarding questions
-- 2. onboarding_responses - User answers to onboarding questions
-- 3. onboarding_sessions - Tracks onboarding completion/skip status
-- 4. fee_structures - Admin-managed fee/pricing data
-- 5. notification_recipients - Team members who receive notifications
-- 6. admin_notifications - In-app notification bell for admin
-- 7. Users table: onboarding_completed fields

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE onboarding_question_type AS ENUM ('single_select', 'multi_select', 'scale');
CREATE TYPE onboarding_session_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped');
CREATE TYPE program_type AS ENUM ('year_long', 'crash_course');
CREATE TYPE notification_event_type AS ENUM (
  'new_onboarding',
  'onboarding_skipped',
  'new_application',
  'payment_received',
  'demo_registration'
);
CREATE TYPE notification_recipient_role AS ENUM ('admin', 'team_lead', 'team_member');

-- ============================================
-- 1. ONBOARDING QUESTIONS (Admin-managed)
-- ============================================

CREATE TABLE onboarding_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key TEXT UNIQUE NOT NULL,
  question_text TEXT NOT NULL,
  question_text_ta TEXT,
  question_type onboarding_question_type NOT NULL DEFAULT 'single_select',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_required BOOLEAN DEFAULT false,
  maps_to_field TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update trigger
CREATE TRIGGER update_onboarding_questions_updated_at
  BEFORE UPDATE ON onboarding_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE onboarding_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active onboarding questions"
  ON onboarding_questions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage onboarding questions"
  ON onboarding_questions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index
CREATE INDEX idx_onboarding_questions_active_order
  ON onboarding_questions (is_active, display_order)
  WHERE is_active = true;

-- ============================================
-- 2. ONBOARDING RESPONSES (User answers)
-- ============================================

CREATE TABLE onboarding_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES onboarding_questions(id) ON DELETE CASCADE NOT NULL,
  response JSONB NOT NULL,
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- RLS
ALTER TABLE onboarding_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own onboarding responses"
  ON onboarding_responses FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own onboarding responses"
  ON onboarding_responses FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own onboarding responses"
  ON onboarding_responses FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all onboarding responses"
  ON onboarding_responses FOR SELECT
  USING (true);

-- Index
CREATE INDEX idx_onboarding_responses_user
  ON onboarding_responses (user_id);

-- ============================================
-- 3. ONBOARDING SESSIONS (Completion tracking)
-- ============================================

CREATE TABLE onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  status onboarding_session_status DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  source_app TEXT,
  questions_answered INT DEFAULT 0,
  total_questions INT DEFAULT 0,
  admin_notified BOOLEAN DEFAULT false,
  telegram_notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update trigger
CREATE TRIGGER update_onboarding_sessions_updated_at
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own onboarding session"
  ON onboarding_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own onboarding session"
  ON onboarding_sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all onboarding sessions"
  ON onboarding_sessions FOR SELECT
  USING (true);

-- Index
CREATE INDEX idx_onboarding_sessions_status
  ON onboarding_sessions (status);

-- ============================================
-- 4. FEE STRUCTURES (Admin-managed pricing)
-- ============================================

CREATE TABLE fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_type course_type NOT NULL,
  program_type program_type NOT NULL,
  display_name TEXT NOT NULL,
  display_name_ta TEXT,
  fee_amount DECIMAL(10,2) NOT NULL,
  combo_extra_fee DECIMAL(10,2) DEFAULT 0,
  duration TEXT NOT NULL,
  schedule_summary TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update trigger
CREATE TRIGGER update_fee_structures_updated_at
  BEFORE UPDATE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active fee structures"
  ON fee_structures FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage fee structures"
  ON fee_structures FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index
CREATE INDEX idx_fee_structures_active_order
  ON fee_structures (is_active, display_order)
  WHERE is_active = true;

-- ============================================
-- 5. NOTIFICATION RECIPIENTS (Admin-managed team)
-- ============================================

CREATE TABLE notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role notification_recipient_role DEFAULT 'team_member',
  notification_preferences JSONB DEFAULT '{
    "new_onboarding": true,
    "onboarding_skipped": false,
    "new_application": true,
    "payment_received": true,
    "demo_registration": true,
    "daily_summary": true
  }'::jsonb,
  is_active BOOLEAN DEFAULT true,
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update trigger
CREATE TRIGGER update_notification_recipients_updated_at
  BEFORE UPDATE ON notification_recipients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification recipients"
  ON notification_recipients FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 6. ADMIN NOTIFICATIONS (In-app bell)
-- ============================================

CREATE TABLE admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type notification_event_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  read_by UUID REFERENCES users(id),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all admin notifications"
  ON admin_notifications FOR SELECT
  USING (true);

CREATE POLICY "Admins can update admin notifications"
  ON admin_notifications FOR UPDATE
  USING (true);

CREATE POLICY "System can insert admin notifications"
  ON admin_notifications FOR INSERT
  WITH CHECK (true);

-- Index
CREATE INDEX idx_admin_notifications_unread
  ON admin_notifications (is_read, created_at DESC)
  WHERE is_read = false;

CREATE INDEX idx_admin_notifications_created
  ON admin_notifications (created_at DESC);

-- ============================================
-- 7. ALTER USERS TABLE
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- ============================================
-- SEED: Initial Onboarding Questions
-- ============================================

INSERT INTO onboarding_questions (question_key, question_text, question_text_ta, question_type, options, display_order, maps_to_field, is_active) VALUES
(
  'architect_motivation',
  'How passionate are you about becoming an architect?',
  'கட்டிடக்கலைஞர் ஆவதில் உங்களுக்கு எவ்வளவு ஆர்வம்?',
  'scale',
  '{"min": 1, "max": 10, "min_label": "Just exploring", "max_label": "My dream career!", "min_label_ta": "ஆராய்ச்சி செய்கிறேன்", "max_label_ta": "என் கனவு தொழில்!"}'::jsonb,
  1,
  NULL,
  true
),
(
  'exam_focus',
  'Which exam are you preparing for?',
  'நீங்கள் எந்த தேர்வுக்கு தயாராகிறீர்கள்?',
  'multi_select',
  '[
    {"value": "nata", "label": "NATA", "label_ta": "NATA", "icon": "pencil_ruler"},
    {"value": "jee_paper2", "label": "JEE Paper 2", "label_ta": "JEE பேப்பர் 2", "icon": "construction"},
    {"value": "revit", "label": "Revit Class", "label_ta": "ரெவிட் வகுப்பு", "icon": "computer"},
    {"value": "not_sure", "label": "Not sure yet", "label_ta": "இன்னும் தெரியவில்லை", "icon": "help_outline"}
  ]'::jsonb,
  2,
  'interest_course',
  true
),
(
  'education_stage',
  'What is your current education stage?',
  'உங்கள் தற்போதைய கல்வி நிலை என்ன?',
  'single_select',
  '[
    {"value": "8th", "label": "8th Standard", "label_ta": "8ம் வகுப்பு"},
    {"value": "9th", "label": "9th Standard", "label_ta": "9ம் வகுப்பு"},
    {"value": "10th", "label": "10th Standard", "label_ta": "10ம் வகுப்பு"},
    {"value": "11th", "label": "11th Standard", "label_ta": "11ம் வகுப்பு"},
    {"value": "12th", "label": "12th Standard", "label_ta": "12ம் வகுப்பு"},
    {"value": "college", "label": "College Student", "label_ta": "கல்லூரி மாணவர்"},
    {"value": "working", "label": "Working Professional", "label_ta": "பணிபுரிபவர்"}
  ]'::jsonb,
  3,
  'applicant_category',
  true
),
(
  'referral_source',
  'How did you find Neram Classes?',
  'நேரம் வகுப்புகளை எப்படி கண்டுபிடித்தீர்கள்?',
  'single_select',
  '[
    {"value": "youtube", "label": "YouTube", "label_ta": "யூடியூப்", "icon": "smart_display"},
    {"value": "instagram", "label": "Instagram", "label_ta": "இன்ஸ்டாகிராம்", "icon": "photo_camera"},
    {"value": "google", "label": "Google Search", "label_ta": "கூகுள் தேடல்", "icon": "search"},
    {"value": "friend", "label": "Friend / Classmate", "label_ta": "நண்பர் / வகுப்புத்தோழர்", "icon": "group"},
    {"value": "old_student", "label": "Past Student", "label_ta": "முன்னாள் மாணவர்", "icon": "school"},
    {"value": "school_visit", "label": "School Visit", "label_ta": "பள்ளி வருகை", "icon": "domain"},
    {"value": "whatsapp", "label": "WhatsApp", "label_ta": "வாட்ஸ்அப்", "icon": "chat"},
    {"value": "other", "label": "Other", "label_ta": "மற்றவை", "icon": "more_horiz"}
  ]'::jsonb,
  4,
  NULL,
  true
),
(
  'school_type',
  'What type of school do you study in?',
  'நீங்கள் எந்த வகையான பள்ளியில் படிக்கிறீர்கள்?',
  'single_select',
  '[
    {"value": "government", "label": "Government School", "label_ta": "அரசு பள்ளி", "icon": "account_balance"},
    {"value": "private", "label": "Private School", "label_ta": "தனியார் பள்ளி", "icon": "school"},
    {"value": "aided", "label": "Aided School", "label_ta": "உதவிபெறும் பள்ளி", "icon": "menu_book"},
    {"value": "cbse", "label": "CBSE School", "label_ta": "CBSE பள்ளி", "icon": "auto_stories"},
    {"value": "not_applicable", "label": "Not applicable", "label_ta": "பொருந்தாது", "icon": "remove"}
  ]'::jsonb,
  5,
  NULL,
  true
),
(
  'caste_category',
  'What is your community category?',
  'உங்கள் சமூக வகை என்ன?',
  'single_select',
  '[
    {"value": "general", "label": "General / OC", "label_ta": "பொது / OC"},
    {"value": "obc", "label": "OBC / BC / MBC", "label_ta": "OBC / BC / MBC"},
    {"value": "sc", "label": "SC", "label_ta": "SC"},
    {"value": "st", "label": "ST", "label_ta": "ST"},
    {"value": "ews", "label": "EWS", "label_ta": "EWS"},
    {"value": "other", "label": "Other", "label_ta": "மற்றவை"}
  ]'::jsonb,
  6,
  'caste_category',
  true
);

-- ============================================
-- SEED: Email Templates for Notifications
-- ============================================

INSERT INTO email_templates (name, slug, subject, body_html, body_text, variables, is_active) VALUES
(
  'Team - New Onboarding',
  'team-new-onboarding',
  '{"en": "New User Onboarded: {{user_name}}"}'::jsonb,
  '{"en": "<h2>New User Onboarded</h2><p><strong>Name:</strong> {{user_name}}</p><p><strong>Phone:</strong> {{phone}}</p><p><strong>Exam Interest:</strong> {{exam_interest}}</p><p><strong>Education Stage:</strong> {{education_stage}}</p><p><strong>Found via:</strong> {{referral_source}}</p><p><strong>Source App:</strong> {{source_app}}</p>"}'::jsonb,
  '{"en": "New User Onboarded\nName: {{user_name}}\nPhone: {{phone}}\nExam Interest: {{exam_interest}}\nEducation: {{education_stage}}\nFound via: {{referral_source}}"}'::jsonb,
  ARRAY['user_name', 'phone', 'exam_interest', 'education_stage', 'referral_source', 'source_app'],
  true
),
(
  'Team - New Application',
  'team-new-application',
  '{"en": "New Application Submitted: {{user_name}}"}'::jsonb,
  '{"en": "<h2>New Application Submitted</h2><p><strong>Name:</strong> {{user_name}}</p><p><strong>Phone:</strong> {{phone}}</p><p><strong>Course:</strong> {{course}}</p><p><strong>City:</strong> {{city}}, {{state}}</p><p><strong>Application #:</strong> {{application_number}}</p>"}'::jsonb,
  '{"en": "New Application Submitted\nName: {{user_name}}\nPhone: {{phone}}\nCourse: {{course}}\nCity: {{city}}, {{state}}\nApplication #: {{application_number}}"}'::jsonb,
  ARRAY['user_name', 'phone', 'course', 'city', 'state', 'application_number'],
  true
);
