-- Migration: Refund Request System
-- Creates refund_requests table and adds new notification event types
-- Refund rules: 24-hour window, 30% processing fee, admin discretion, one request per payment

-- New refund request status type
CREATE TYPE refund_request_status AS ENUM ('pending', 'approved', 'rejected');

-- refund_requests table
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  lead_profile_id UUID REFERENCES lead_profiles(id),

  -- Payment reference data (denormalized for quick admin view)
  payment_amount DECIMAL(10,2) NOT NULL,
  refund_amount DECIMAL(10,2) NOT NULL,        -- payment_amount * 0.70
  processing_fee DECIMAL(10,2) NOT NULL,       -- payment_amount * 0.30

  -- User-provided reasons
  reason_for_joining TEXT NOT NULL,
  reason_for_discontinuing TEXT NOT NULL,
  additional_notes TEXT,

  -- Status
  status refund_request_status DEFAULT 'pending' NOT NULL,

  -- Admin handling
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One refund request per payment (no re-submissions)
  CONSTRAINT unique_payment_refund UNIQUE (payment_id)
);

-- Enable RLS
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own refund requests"
  ON refund_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own refund requests"
  ON refund_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access on refund_requests"
  ON refund_requests FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_refund_requests_user
  ON refund_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status
  ON refund_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_payment
  ON refund_requests (payment_id);

-- Add new notification event types for refund flow
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'refund_requested';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'refund_approved';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'refund_rejected';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_refund_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refund_requests_updated_at
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_refund_requests_updated_at();

NOTIFY pgrst, 'reload schema';
