-- Foundation Watch Sessions
-- Tracks per-section video watch time for engagement analytics.
-- Teachers can see whether students actually watched or just buffered through.

CREATE TABLE nexus_foundation_watch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES nexus_foundation_chapters(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES nexus_foundation_sections(id) ON DELETE CASCADE,

  -- Core watch metrics
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  section_duration_seconds INTEGER NOT NULL DEFAULT 0,
  completion_pct NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Engagement signals
  play_count INTEGER NOT NULL DEFAULT 1,
  pause_count INTEGER NOT NULL DEFAULT 0,
  seek_count INTEGER NOT NULL DEFAULT 0,

  -- Device context
  device_type TEXT CHECK (device_type IN ('mobile', 'tablet', 'desktop')),

  -- Session timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for teacher queries
CREATE INDEX idx_fdn_watch_student_chapter ON nexus_foundation_watch_sessions(student_id, chapter_id);
CREATE INDEX idx_fdn_watch_section ON nexus_foundation_watch_sessions(section_id);
CREATE INDEX idx_fdn_watch_chapter ON nexus_foundation_watch_sessions(chapter_id);

-- RLS
ALTER TABLE nexus_foundation_watch_sessions ENABLE ROW LEVEL SECURITY;

-- Students can read their own watch sessions
CREATE POLICY "Students read own watch sessions"
  ON nexus_foundation_watch_sessions FOR SELECT
  USING (student_id = auth.uid());

-- Service role handles inserts/updates (via API routes with admin client)
