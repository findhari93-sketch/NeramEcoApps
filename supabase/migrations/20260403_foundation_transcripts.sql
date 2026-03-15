-- ============================================
-- FOUNDATION VIDEO TRANSCRIPTS
-- Stores timestamped transcript entries per chapter per language
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_foundation_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES nexus_foundation_chapters(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'en',
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chapter_id, language)
);

CREATE INDEX idx_transcripts_chapter ON nexus_foundation_transcripts(chapter_id);

-- RLS
ALTER TABLE nexus_foundation_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_transcripts" ON nexus_foundation_transcripts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- entries JSONB format:
-- [
--   { "start": 0, "end": 5.2, "text": "Hello and welcome..." },
--   { "start": 5.2, "end": 10.8, "text": "In this chapter..." },
--   ...
-- ]
