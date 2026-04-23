-- College Outreach Log: one row per outbound email sent to a college
-- Separate from email_logs because outreach has college-specific metadata and lifecycle

CREATE TABLE IF NOT EXISTS college_outreach_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  template_variant TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  sent_bcc TEXT,
  sent_from TEXT NOT NULL DEFAULT 'info@neramclasses.com',
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'resend' CHECK (channel IN ('resend','manual_outlook')),
  resend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','bounced','replied')),
  error_message TEXT,
  sent_by_name TEXT,
  sent_by_email TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_col_outreach_college ON college_outreach_log(college_id);
CREATE INDEX IF NOT EXISTS idx_col_outreach_sent_at ON college_outreach_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_col_outreach_status  ON college_outreach_log(status);

ALTER TABLE college_outreach_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON college_outreach_log;
CREATE POLICY "Service role full access" ON college_outreach_log
  FOR ALL USING (auth.role() = 'service_role');

-- Add contact tracking columns on colleges
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS contact_status TEXT NOT NULL DEFAULT 'never_contacted'
    CHECK (contact_status IN ('never_contacted','emailed_v1','replied','engaged','claimed','bounced','opted_out')),
  ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outreach_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_colleges_contact_status ON colleges(contact_status);
