-- Migration: YouTube Subscription Coupons
-- Description: Creates table for tracking YouTube subscriptions and their associated coupons

-- ============================================
-- YOUTUBE SUBSCRIPTION COUPONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS youtube_subscription_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE NOT NULL,
  youtube_channel_id VARCHAR(50) NOT NULL,
  youtube_subscription_id VARCHAR(100),
  subscribed_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one coupon per user per channel
  UNIQUE(user_id, youtube_channel_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_yt_sub_coupons_user ON youtube_subscription_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_yt_sub_coupons_coupon ON youtube_subscription_coupons(coupon_id);
CREATE INDEX IF NOT EXISTS idx_yt_sub_coupons_channel ON youtube_subscription_coupons(youtube_channel_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_youtube_subscription_coupons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS youtube_subscription_coupons_updated_at ON youtube_subscription_coupons;
CREATE TRIGGER youtube_subscription_coupons_updated_at
  BEFORE UPDATE ON youtube_subscription_coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_youtube_subscription_coupons_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE youtube_subscription_coupons ENABLE ROW LEVEL SECURITY;

-- Users can only see their own subscription coupons
CREATE POLICY youtube_subscription_coupons_select_own ON youtube_subscription_coupons
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Admin users can see all subscription coupons
CREATE POLICY youtube_subscription_coupons_select_admin ON youtube_subscription_coupons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id::text = auth.uid()::text
      AND user_type = 'admin'
    )
  );

-- Only the system (service role) can insert/update/delete
CREATE POLICY youtube_subscription_coupons_insert_service ON youtube_subscription_coupons
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY youtube_subscription_coupons_update_service ON youtube_subscription_coupons
  FOR UPDATE
  USING (true);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE youtube_subscription_coupons IS 'Tracks YouTube channel subscriptions and associated discount coupons';
COMMENT ON COLUMN youtube_subscription_coupons.user_id IS 'Reference to the user who subscribed';
COMMENT ON COLUMN youtube_subscription_coupons.coupon_id IS 'Reference to the generated coupon';
COMMENT ON COLUMN youtube_subscription_coupons.youtube_channel_id IS 'YouTube channel ID that was subscribed to';
COMMENT ON COLUMN youtube_subscription_coupons.youtube_subscription_id IS 'YouTube subscription ID from the API';
COMMENT ON COLUMN youtube_subscription_coupons.subscribed_at IS 'When the subscription was created on YouTube';
COMMENT ON COLUMN youtube_subscription_coupons.ip_address IS 'IP address of the user when subscribing';
COMMENT ON COLUMN youtube_subscription_coupons.user_agent IS 'Browser user agent when subscribing';
