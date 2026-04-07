-- Message replies: logs every reply sent from admin panel
CREATE TABLE IF NOT EXISTS message_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  reply_body TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  sent_from TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  sent_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_replies_message_id ON message_replies(message_id);

-- RLS: service role only (admin API routes use service role client)
ALTER TABLE message_replies ENABLE ROW LEVEL SECURITY;
