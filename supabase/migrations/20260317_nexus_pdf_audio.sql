-- Add PDF and Audio content support to foundation chapters and module items
-- Chapters can now have video AND/OR PDF AND/OR audio (multiple languages)

-- =============================================
-- 1. Foundation chapters: PDF columns
-- =============================================
ALTER TABLE nexus_foundation_chapters
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_page_count INTEGER;

-- =============================================
-- 2. Module items: PDF columns
-- =============================================
ALTER TABLE nexus_module_items
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_page_count INTEGER;

-- =============================================
-- 3. Audio tracks table (multi-language audiobook)
-- One chapter/module item can have multiple audio tracks in different languages
-- =============================================
CREATE TABLE IF NOT EXISTS nexus_audio_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Polymorphic: belongs to either a foundation chapter or a module item
  chapter_id UUID REFERENCES nexus_foundation_chapters(id) ON DELETE CASCADE,
  module_item_id UUID REFERENCES nexus_module_items(id) ON DELETE CASCADE,
  -- Language
  language TEXT NOT NULL DEFAULT 'en',
  language_label TEXT NOT NULL DEFAULT 'English',
  -- Audio file
  audio_url TEXT NOT NULL,
  audio_storage_path TEXT NOT NULL,
  audio_duration_seconds INTEGER,
  -- Ordering (primary language first)
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Must belong to either a chapter or module item (not both)
  CONSTRAINT audio_track_parent_check CHECK (
    (chapter_id IS NOT NULL AND module_item_id IS NULL) OR
    (chapter_id IS NULL AND module_item_id IS NOT NULL)
  ),
  -- One language per parent
  CONSTRAINT audio_track_unique_lang_chapter UNIQUE (chapter_id, language),
  CONSTRAINT audio_track_unique_lang_item UNIQUE (module_item_id, language)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_audio_tracks_chapter ON nexus_audio_tracks(chapter_id) WHERE chapter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_tracks_item ON nexus_audio_tracks(module_item_id) WHERE module_item_id IS NOT NULL;

-- =============================================
-- 4. Student progress: reading/listening position
-- =============================================
ALTER TABLE nexus_foundation_student_progress
  ADD COLUMN IF NOT EXISTS last_pdf_page INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_audio_position_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_audio_language TEXT DEFAULT 'en';

ALTER TABLE nexus_module_student_progress
  ADD COLUMN IF NOT EXISTS last_pdf_page INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_audio_position_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_audio_language TEXT DEFAULT 'en';

-- =============================================
-- 5. Relax video constraint for PDF/audio-only chapters
-- =============================================
ALTER TABLE nexus_foundation_chapters DROP CONSTRAINT IF EXISTS video_source_data_check;

-- Make video_source nullable (chapters can be PDF-only or audio-only)
ALTER TABLE nexus_foundation_chapters ALTER COLUMN video_source DROP NOT NULL;
ALTER TABLE nexus_foundation_chapters ALTER COLUMN video_source DROP DEFAULT;

-- Allow draft chapters with no content yet, or PDF/audio-only chapters
ALTER TABLE nexus_foundation_chapters
  ADD CONSTRAINT content_source_check CHECK (
    (video_source = 'youtube' AND youtube_video_id IS NOT NULL) OR
    (video_source = 'sharepoint' AND sharepoint_video_url IS NOT NULL) OR
    (pdf_url IS NOT NULL) OR
    -- Allow drafts with no content
    (video_source IS NULL AND pdf_url IS NULL)
  );

-- RLS: audio tracks readable by all authenticated, writable by teachers/admins
ALTER TABLE nexus_audio_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audio tracks readable by authenticated users"
  ON nexus_audio_tracks FOR SELECT
  USING (true);

CREATE POLICY "Audio tracks writable by creator"
  ON nexus_audio_tracks FOR ALL
  USING (true);
