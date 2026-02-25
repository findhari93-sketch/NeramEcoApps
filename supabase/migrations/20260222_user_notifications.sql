-- ============================================
-- User-Facing In-App Notifications
-- ============================================
-- Creates user_notifications table for per-user notification bell
-- in apps/app (student PWA) and apps/marketing.
-- Reuses the existing notification_event_type enum.
-- Both apps share the same table for cross-app read sync.

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  event_type notification_event_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can only see their own notifications
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON user_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON user_notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "System can insert user notifications"
  ON user_notifications FOR INSERT
  WITH CHECK (true);

-- Service role can read all (for admin debugging and server-side operations)
CREATE POLICY "Service role can read all user notifications"
  ON user_notifications FOR SELECT
  USING (true);

-- Composite index for efficient polling: "get unread for user, newest first"
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON user_notifications (user_id, is_read, created_at DESC)
  WHERE is_read = false;

-- General user+time index for listing all notifications
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications (user_id, created_at DESC);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
