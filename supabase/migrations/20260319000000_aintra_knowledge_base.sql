-- ============================================
-- Aintra Knowledge Base
-- Migration: 20260319000000_aintra_knowledge_base
-- Dynamic Q&A pairs injected into Aintra system prompt
-- Staff manage via admin /aintra-kb page
-- ============================================

CREATE TABLE aintra_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE TRIGGER set_aintra_kb_updated_at
  BEFORE UPDATE ON aintra_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for common query patterns
CREATE INDEX idx_aintra_kb_active ON aintra_knowledge_base(is_active);
CREATE INDEX idx_aintra_kb_order ON aintra_knowledge_base(display_order ASC);
CREATE INDEX idx_aintra_kb_category ON aintra_knowledge_base(category);

-- RLS: only service role (server-side) can read/write
ALTER TABLE aintra_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on aintra_knowledge_base"
  ON aintra_knowledge_base FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
