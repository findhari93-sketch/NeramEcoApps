-- Voice feedback on drawing reviews.
--
-- One voice note per drawing attempt, recorded by the teacher on the review
-- screen and delivered to the student with Redo or Complete.
--
-- Kept OUT of drawing_submissions on purpose. The gallery feed selects * from
-- that table for every student, and tutor_feedback is mostly pasted Gemini text,
-- so a teacher's own voice gets its own row that nothing reads by accident.
--
-- Service role only: RLS is on and there are no policies. Every read and write
-- goes through a Nexus API route that checks the caller, and the audio itself is
-- served through short-lived signed URLs from a private bucket.

CREATE TABLE IF NOT EXISTS drawing_voice_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One note per attempt. Re-recording replaces it.
  submission_id UUID NOT NULL UNIQUE REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  -- Copied from the submission so the listen route can check ownership in one read.
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  audio_path TEXT NOT NULL,
  audio_mime TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 1000 AND 180000),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  -- The image the note was recorded against, so a later rotation cannot move
  -- sketch strokes off the part of the drawing they were about.
  base_image_url TEXT,
  -- "Talk while you sketch" timeline. NULL for a plain voice note.
  sketch JSONB,
  -- NULL means draft: recorded, not yet delivered.
  sent_at TIMESTAMPTZ,
  first_played_at TIMESTAMPTZ,
  heard_fully_at TIMESTAMPTZ,
  max_position_ms INTEGER NOT NULL DEFAULT 0,
  play_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drawing_voice_feedback_student
  ON drawing_voice_feedback(student_id);

ALTER TABLE drawing_voice_feedback ENABLE ROW LEVEL SECURITY;

-- Private bucket; no anon or authenticated policies on purpose. The browser
-- uploads straight to storage through a signed upload URL, so audio never passes
-- through a Vercel function.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('drawing-voice-feedback', 'drawing-voice-feedback', false, 10485760,
        ARRAY['audio/webm', 'audio/mp4', 'audio/ogg'])
ON CONFLICT (id) DO NOTHING;
