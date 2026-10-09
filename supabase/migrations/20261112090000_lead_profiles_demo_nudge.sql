-- One WhatsApp nudge per unfinished application: "not sure yet? book a free
-- demo class". The admin demo-messages cron claims a draft by setting this
-- before it sends, so a draft is never nudged twice.
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS demo_nudge_sent_at timestamptz;

COMMENT ON COLUMN lead_profiles.demo_nudge_sent_at IS
  'When the one "book a free demo" WhatsApp nudge for this unfinished draft was claimed (sent or attempted). Null = never.';

-- The cron scans drafts last touched 24 to 72 hours ago that were never nudged.
CREATE INDEX IF NOT EXISTS idx_lead_profiles_draft_demo_nudge
  ON lead_profiles (updated_at)
  WHERE status = 'draft' AND demo_nudge_sent_at IS NULL;
