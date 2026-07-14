-- Optional class recording linked to a study-material file. A teacher can attach the recording of
-- the class where this chapter was taught; students may watch it (self-learning). Watching is
-- optional, the linked test still gates completion.
--
--   video_source: 'youtube' (embeddable) | 'link' (any other URL, opened externally)
--   youtube_id:   11-char id when video_source = 'youtube'
--   recording_url: the raw pasted URL (used for 'link', kept for reference on 'youtube' too)

ALTER TABLE nexus_study_files
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS video_source  TEXT,
  ADD COLUMN IF NOT EXISTS youtube_id    TEXT;
