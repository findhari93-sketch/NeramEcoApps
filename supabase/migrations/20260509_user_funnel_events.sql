-- User Funnel Events: Track auth, onboarding, and application funnel steps
-- Purpose: Diagnose where users drop off after Google auth, before phone verification, etc.

CREATE TABLE IF NOT EXISTS user_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id TEXT,

  -- Event classification
  funnel TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',

  -- Error context
  error_message TEXT,
  error_code TEXT,
  metadata JSONB DEFAULT '{}',

  -- Device context (denormalized for fast admin queries)
  device_session_id UUID REFERENCES user_device_sessions(id) ON DELETE SET NULL,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  ip_address TEXT,

  -- Source
  source_app TEXT NOT NULL,
  page_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add CHECK constraints
ALTER TABLE user_funnel_events
  ADD CONSTRAINT chk_funnel CHECK (funnel IN ('auth', 'onboarding', 'application')),
  ADD CONSTRAINT chk_status CHECK (status IN ('started', 'completed', 'failed', 'skipped'));

-- Indexes for common query patterns
CREATE INDEX idx_funnel_events_user_created ON user_funnel_events(user_id, created_at DESC);
CREATE INDEX idx_funnel_events_funnel_event ON user_funnel_events(funnel, event);
CREATE INDEX idx_funnel_events_anonymous ON user_funnel_events(anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX idx_funnel_events_created ON user_funnel_events(created_at DESC);

-- RLS
ALTER TABLE user_funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events"
  ON user_funnel_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role full access"
  ON user_funnel_events FOR ALL
  USING (auth.role() = 'service_role');

-- Aggregate view for admin funnel chart
CREATE OR REPLACE VIEW auth_funnel_summary AS
SELECT
  date_trunc('week', created_at) AS week,
  source_app,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'google_auth_started') AS auth_started,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'google_auth_completed') AS auth_completed,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'register_user_completed') AS user_registered,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'phone_screen_shown') AS phone_shown,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'phone_number_entered') AS phone_entered,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'otp_requested') AS otp_requested,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'otp_verified') AS otp_verified
FROM user_funnel_events
WHERE funnel = 'auth'
GROUP BY 1, 2;

-- Helper function to get the last auth step for a user
CREATE OR REPLACE FUNCTION get_user_last_auth_step(p_user_id UUID)
RETURNS TABLE(
  last_event TEXT,
  last_status TEXT,
  last_error_message TEXT,
  last_error_code TEXT,
  event_at TIMESTAMPTZ,
  device_type TEXT,
  browser TEXT,
  os TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ufe.event,
    ufe.status,
    ufe.error_message,
    ufe.error_code,
    ufe.created_at,
    ufe.device_type,
    ufe.browser,
    ufe.os
  FROM user_funnel_events ufe
  WHERE ufe.user_id = p_user_id
    AND ufe.funnel = 'auth'
  ORDER BY ufe.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;
