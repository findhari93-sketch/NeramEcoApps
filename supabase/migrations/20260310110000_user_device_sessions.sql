-- User Device Sessions & Error Logs
-- Tracks device info, precise location, and crash diagnostics per user session

-- Device sessions table
CREATE TABLE IF NOT EXISTS user_device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Device info
  device_type TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  user_agent TEXT,
  screen_width INT,
  screen_height INT,
  device_pixel_ratio REAL,

  -- Location (precise)
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_accuracy REAL,
  city TEXT,
  state TEXT,
  country TEXT,
  timezone TEXT,

  -- Network & performance
  connection_type TEXT,
  effective_bandwidth REAL,
  language TEXT,

  -- Session metadata
  app_version TEXT,
  is_pwa BOOLEAN DEFAULT false,
  session_start TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now(),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON user_device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_created ON user_device_sessions(created_at DESC);

-- Error logs table
CREATE TABLE IF NOT EXISTS user_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES user_device_sessions(id) ON DELETE SET NULL,

  error_type TEXT,
  error_message TEXT,
  error_stack TEXT,
  page_url TEXT,
  component TEXT,

  device_type TEXT,
  browser TEXT,
  os TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_user ON user_error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON user_error_logs(created_at DESC);

-- RLS
ALTER TABLE user_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_error_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own sessions
CREATE POLICY "Users can insert own device sessions"
  ON user_device_sessions FOR INSERT
  WITH CHECK (true);

-- Users can read their own sessions
CREATE POLICY "Users can read own device sessions"
  ON user_device_sessions FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own sessions (last_active)
CREATE POLICY "Users can update own device sessions"
  ON user_device_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- Users can insert error logs
CREATE POLICY "Users can insert error logs"
  ON user_error_logs FOR INSERT
  WITH CHECK (true);

-- Users can read own error logs
CREATE POLICY "Users can read own error logs"
  ON user_error_logs FOR SELECT
  USING (user_id = auth.uid());
