-- Demo desk: audit (who added / who last edited) + the morning "demos today" digest.
--
-- created_by / last_edited_by / last_edited_at let the request desk show a clear
-- audit line. A demo added by staff (Add demo) records who added it; a website
-- booking leaves created_by null (shown as "from the website"). Every later edit
-- (time, person data, who takes it) stamps last_edited_by / last_edited_at.
--
-- demo_today_digest_log makes the 08:00 IST per-tutor digest idempotent: the
-- Nexus cron claims (day_key, user_id) before sending, so overlapping cron runs
-- never message a tutor twice on the same day.

ALTER TABLE demo_class_registrations
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

COMMENT ON COLUMN demo_class_registrations.created_by IS
  'Staff who added this demo (Add demo). Null means it came from the website.';
COMMENT ON COLUMN demo_class_registrations.last_edited_by IS
  'Staff who last edited this demo (time, person data, or who takes it).';

-- One row per tutor per IST day, written once their "demos today" digest is sent.
CREATE TABLE IF NOT EXISTS demo_today_digest_log (
  day_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day_key, user_id)
);

COMMENT ON TABLE demo_today_digest_log IS
  'Guard for the 08:00 IST per-tutor demo digest: a claimed (day_key, user_id) means that tutor was already told today. Service role only.';

ALTER TABLE demo_today_digest_log ENABLE ROW LEVEL SECURITY;
