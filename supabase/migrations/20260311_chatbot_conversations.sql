-- ============================================
-- Chatbot Conversations Table
-- Migration: 20260311_chatbot_conversations
-- Stores NATA chatbot interaction logs
-- ============================================

CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  ai_response TEXT,
  page_url TEXT,
  source TEXT NOT NULL DEFAULT 'nata_chatbot',
  lead_name TEXT,
  lead_phone TEXT,
  model_used TEXT,
  response_time_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chatbot_session ON chatbot_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_user ON chatbot_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_created ON chatbot_conversations(created_at DESC);

-- RLS
ALTER TABLE chatbot_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert chatbot conversations"
  ON chatbot_conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role full access on chatbot conversations"
  ON chatbot_conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
