-- Demo Class v2: request-first booking.
--
-- A student asks for a day + time window (or "any time, call me"), signs in at
-- the last step, staff call them, confirm an exact time, and the admin app
-- creates a 1:1 Teams meeting. Rows stay in demo_class_registrations so the CRM
-- stage, the user timeline, the CRM demo section and the ads demo_booked upload
-- keep reading the same table. slot_id becomes optional: v2 rows have none.
--
-- 'contacted' is added here; the one-active-request index that names it lives
-- in the next migration, because a new enum value cannot be used in the
-- transaction that adds it.

ALTER TYPE demo_registration_status ADD VALUE IF NOT EXISTS 'contacted' AFTER 'pending';

-- Neram Assistant reminders to the demo team (sent by Nexus through sendNudge).
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'demo_reminder';

ALTER TABLE demo_class_registrations
  ALTER COLUMN slot_id DROP NOT NULL;

ALTER TABLE demo_class_registrations
  ADD COLUMN IF NOT EXISTS ref_code TEXT,
  ADD COLUMN IF NOT EXISTS join_token TEXT,
  ADD COLUMN IF NOT EXISTS preferred_date DATE,
  ADD COLUMN IF NOT EXISTS preferred_window TEXT
    CHECK (preferred_window IN ('morning', 'afternoon', 'evening', 'anytime')),
  ADD COLUMN IF NOT EXISTS parent_joining BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parent_email TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_minutes INT NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS schedule_change_reason TEXT,
  ADD COLUMN IF NOT EXISTS host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organizer_upn TEXT,
  -- Staff on this demo (calendar + reminders) and the one who teaches it.
  ADD COLUMN IF NOT EXISTS staff_upns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tutor_upn TEXT,
  ADD COLUMN IF NOT EXISTS teams_join_url TEXT,
  ADD COLUMN IF NOT EXISTS graph_event_id TEXT,
  ADD COLUMN IF NOT EXISTS next_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_call_outcome TEXT
    CHECK (last_call_outcome IN ('interested', 'no_answer', 'call_back', 'not_interested')),
  ADD COLUMN IF NOT EXISTS drawing_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drawing_feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_reg_ref_code
  ON demo_class_registrations (ref_code) WHERE ref_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_reg_join_token
  ON demo_class_registrations (join_token) WHERE join_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demo_reg_status_start
  ON demo_class_registrations (status, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_demo_reg_user
  ON demo_class_registrations (user_id);

-- v2 rows carry no slot, so the slot counter must skip them.
CREATE OR REPLACE FUNCTION update_demo_slot_registration_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.slot_id IS NOT NULL THEN
    UPDATE demo_class_slots
    SET current_registrations = current_registrations + 1,
        updated_at = NOW()
    WHERE id = NEW.slot_id;
  ELSIF TG_OP = 'DELETE' AND OLD.slot_id IS NOT NULL THEN
    UPDATE demo_class_slots
    SET current_registrations = GREATEST(current_registrations - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.slot_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Everything staff and the system did with a request: calls, notes, status
-- changes, scheduling and WhatsApp sends. The admin desk shows it as a log.
CREATE TABLE IF NOT EXISTS demo_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES demo_class_registrations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('call', 'note', 'status', 'message', 'schedule', 'drawing')),
  outcome TEXT,
  note TEXT,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_request_events_reg
  ON demo_request_events (registration_id, created_at DESC);

ALTER TABLE demo_request_events ENABLE ROW LEVEL SECURITY;

-- Queue for every demo message. Kept apart from auto_messages because the
-- first-touch cron sends every pending auto_messages row with its own logic.
--   channel 'whatsapp':  student/parent, Meta template, sent by the admin cron.
--   channel 'assistant': demo team, Neram Assistant via sendNudge, sent by the
--                        Nexus cron (it owns the Teams bot).
-- Content is built at send time from the registration, so a rename, a moved
-- time or a parent number added later is picked up.
CREATE TABLE IF NOT EXISTS demo_request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES demo_class_registrations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'assistant')),
  recipient TEXT NOT NULL CHECK (recipient IN ('student', 'parent', 'staff')),
  to_phone TEXT,
  to_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'received', 'confirmed', 'reminder_day', 'reminder_soon',
    'rescheduled', 'cancelled', 'thanks', 'missed',
    'staff_new_request', 'staff_callback', 'staff_day', 'staff_soon'
  )),
  send_after TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'skipped')),
  external_message_id TEXT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demo_request_messages_target CHECK (
    (channel = 'whatsapp' AND to_phone IS NOT NULL AND recipient IN ('student', 'parent'))
    OR (channel = 'assistant' AND to_user_id IS NOT NULL AND recipient = 'staff')
  )
);

CREATE INDEX IF NOT EXISTS idx_demo_request_messages_due
  ON demo_request_messages (channel, send_after) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_demo_request_messages_reg
  ON demo_request_messages (registration_id);

DROP TRIGGER IF EXISTS update_demo_request_messages_updated_at ON demo_request_messages;
CREATE TRIGGER update_demo_request_messages_updated_at
  BEFORE UPDATE ON demo_request_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE demo_request_messages ENABLE ROW LEVEL SECURITY;
