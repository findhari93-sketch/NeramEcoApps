-- Device Swap Requests
-- Students request to swap a registered device; admins approve/reject

CREATE TABLE IF NOT EXISTS device_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Which device category to swap
  device_category TEXT NOT NULL CHECK (device_category IN ('desktop', 'mobile')),

  -- Request details
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Admin review
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one pending request per user per category
CREATE UNIQUE INDEX IF NOT EXISTS idx_swap_requests_pending
  ON device_swap_requests(user_id, device_category)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_swap_requests_status ON device_swap_requests(status);
CREATE INDEX IF NOT EXISTS idx_swap_requests_user ON device_swap_requests(user_id);

-- RLS
ALTER TABLE device_swap_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on swap requests"
  ON device_swap_requests FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own swap requests"
  ON device_swap_requests FOR SELECT
  USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_swap_requests_updated_at
  BEFORE UPDATE ON device_swap_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
