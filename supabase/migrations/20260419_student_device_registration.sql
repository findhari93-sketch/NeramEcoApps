-- Student Device Registration & Active Time Tracking
-- Allows max 1 desktop + 1 mobile device per student
-- Tracks active usage time per device via heartbeat

-- Registered devices table
CREATE TABLE IF NOT EXISTS student_registered_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Device identity
  device_fingerprint TEXT NOT NULL,
  device_category TEXT NOT NULL CHECK (device_category IN ('desktop', 'mobile')),
  device_name TEXT,                    -- e.g. "Chrome on Windows 11"

  -- Device details
  device_type TEXT,                    -- 'desktop', 'mobile', 'tablet'
  browser TEXT,
  os TEXT,
  os_version TEXT,
  screen_width INT,
  screen_height INT,
  is_pwa BOOLEAN DEFAULT false,

  -- Usage stats (aggregated)
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  total_active_seconds BIGINT DEFAULT 0,
  session_count INT DEFAULT 0,

  -- Last known location
  last_latitude DOUBLE PRECISION,
  last_longitude DOUBLE PRECISION,
  last_location_accuracy REAL,
  last_city TEXT,
  last_state TEXT,
  last_country TEXT,
  location_consent_given BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  registered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

);

-- Partial unique indexes: only enforce among active devices
-- Allows deregistered devices to remain as history without blocking new registrations
CREATE UNIQUE INDEX IF NOT EXISTS student_registered_devices_active_fingerprint_idx
  ON student_registered_devices(user_id, device_fingerprint)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS student_registered_devices_active_category_idx
  ON student_registered_devices(user_id, device_category)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_registered_devices_user ON student_registered_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_registered_devices_category ON student_registered_devices(device_category);

-- Daily activity logs per device
CREATE TABLE IF NOT EXISTS device_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES student_registered_devices(id) ON DELETE CASCADE,
  session_id UUID REFERENCES user_device_sessions(id) ON DELETE SET NULL,

  active_seconds INT NOT NULL DEFAULT 0,
  idle_seconds INT NOT NULL DEFAULT 0,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON device_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_device ON device_activity_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON device_activity_logs(session_date DESC);

-- RLS
ALTER TABLE student_registered_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_activity_logs ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on registered devices"
  ON student_registered_devices FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on activity logs"
  ON device_activity_logs FOR ALL
  USING (auth.role() = 'service_role');

-- Users can read own devices
CREATE POLICY "Users can read own registered devices"
  ON student_registered_devices FOR SELECT
  USING (user_id = auth.uid());

-- Users can read own activity logs
CREATE POLICY "Users can read own activity logs"
  ON device_activity_logs FOR SELECT
  USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_registered_devices_updated_at
  BEFORE UPDATE ON student_registered_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
