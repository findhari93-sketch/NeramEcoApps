-- Notification receipts: what every sendNudge call actually delivered, and why a
-- channel did not land.
--
-- On 11 Sept a message to 26 students reached no Teams chat, no Teams alert and
-- no email, and nothing anywhere said why: the reasons lived only in serverless
-- console logs, which Vercel does not keep. Since July, 128 of 129 assignment
-- reminders reached only the Nexus bell and nobody could see it. One row per
-- recipient per send, written by apps/nexus/src/lib/nudge-delivery.ts and read by
-- /api/admin/delivery-health.

CREATE TABLE IF NOT EXISTS nexus_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  event_type text NOT NULL,
  source text,
  ref_id text,
  recipient_id uuid REFERENCES users(id) ON DELETE CASCADE,
  chat boolean NOT NULL DEFAULT false,
  bot boolean NOT NULL DEFAULT false,
  teams boolean NOT NULL DEFAULT false,
  inapp boolean NOT NULL DEFAULT false,
  email boolean NOT NULL DEFAULT false,
  channel text NOT NULL,
  reasons jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nnd_event_created ON nexus_notification_deliveries (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nnd_recipient_created ON nexus_notification_deliveries (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nnd_created ON nexus_notification_deliveries (created_at DESC);

ALTER TABLE nexus_notification_deliveries ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
