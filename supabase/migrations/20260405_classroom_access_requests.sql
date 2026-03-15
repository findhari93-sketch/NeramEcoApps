-- ============================================
-- Classroom Access Requests & Nexus Settings
-- ============================================
-- When users log into Nexus but aren't enrolled in any classroom,
-- they can request access. Admins are notified and can approve.

-- 1. Classroom Access Requests
CREATE TABLE IF NOT EXISTS classroom_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one pending request per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_request_per_user
  ON classroom_access_requests (user_id)
  WHERE status = 'pending';

-- Index for admin queries (list all pending)
CREATE INDEX IF NOT EXISTS idx_classroom_access_requests_status
  ON classroom_access_requests (status, created_at DESC);

ALTER TABLE classroom_access_requests ENABLE ROW LEVEL SECURITY;

-- Service role full access (all API routes use admin client)
CREATE POLICY "Service role full access on classroom_access_requests"
  ON classroom_access_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Nexus Settings (key-value store for configurable settings)
CREATE TABLE IF NOT EXISTS nexus_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE nexus_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on nexus_settings"
  ON nexus_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed default admin Teams contacts
INSERT INTO nexus_settings (key, value)
VALUES ('admin_teams_contacts', '["TamilSelvan@neramclasses.com", "Haribabu@neramclasses.com"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Add notification event type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'classroom_access_requested'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_event_type')
  ) THEN
    ALTER TYPE notification_event_type ADD VALUE 'classroom_access_requested';
  END IF;
END $$;
