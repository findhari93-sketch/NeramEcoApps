-- Review Campaign Pipeline
-- Allows admins/teachers to create review campaigns targeting students by city
-- Students receive review requests for Google, Sulekha, JustDial via WhatsApp/Email/In-app

-- ============================================
-- 1. Review Platform URLs (per center)
-- ============================================

CREATE TABLE IF NOT EXISTS review_platform_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID REFERENCES offline_centers(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('google', 'sulekha', 'justdial')),
  review_url TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(center_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_review_platform_urls_center ON review_platform_urls(center_id);
CREATE INDEX IF NOT EXISTS idx_review_platform_urls_platform ON review_platform_urls(platform);

-- ============================================
-- 2. Review Campaigns
-- ============================================

CREATE TABLE IF NOT EXISTS review_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Targeting
  target_city TEXT,                -- NULL = all cities
  target_center_id UUID REFERENCES offline_centers(id),

  -- Platforms to request reviews on
  platforms TEXT[] NOT NULL DEFAULT ARRAY['google'],

  -- Channels to send requests through
  channels TEXT[] NOT NULL DEFAULT ARRAY['whatsapp', 'email', 'in_app'],

  -- Campaign lifecycle
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_campaigns_status ON review_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_review_campaigns_city ON review_campaigns(target_city) WHERE target_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_campaigns_created_by ON review_campaigns(created_by);

-- ============================================
-- 3. Review Campaign Students (tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS review_campaign_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES review_campaigns(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('google', 'sulekha', 'justdial')),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'clicked', 'completed', 'skipped')),
  sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Self-report proof
  screenshot_url TEXT,

  -- Reminders
  reminder_count INT NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(campaign_id, student_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_review_campaign_students_campaign ON review_campaign_students(campaign_id);
CREATE INDEX IF NOT EXISTS idx_review_campaign_students_student ON review_campaign_students(student_id);
CREATE INDEX IF NOT EXISTS idx_review_campaign_students_status ON review_campaign_students(status);

-- ============================================
-- 4. Index on lead_profiles.city for city-wise queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_lead_profiles_city ON lead_profiles(city) WHERE city IS NOT NULL;

-- ============================================
-- 5. RPC: City-wise student counts
-- ============================================

CREATE OR REPLACE FUNCTION get_city_student_counts()
RETURNS TABLE(city TEXT, student_count BIGINT, state TEXT) AS $$
  SELECT
    INITCAP(TRIM(lp.city)) AS city,
    COUNT(DISTINCT u.id) AS student_count,
    MAX(lp.state) AS state
  FROM lead_profiles lp
  JOIN users u ON u.id = lp.user_id
  WHERE lp.city IS NOT NULL
    AND TRIM(lp.city) <> ''
    AND u.user_type IN ('student', 'lead')
  GROUP BY INITCAP(TRIM(lp.city))
  ORDER BY student_count DESC;
$$ LANGUAGE sql STABLE;
