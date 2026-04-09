-- Drawing re-review notifications for students
CREATE TABLE IF NOT EXISTS drawing_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drawing_notifications_student_unread_idx
  ON drawing_notifications(student_id, read)
  WHERE read = FALSE;

-- Separate annotation overlay prompt (for ChatGPT to annotate student image)
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS ai_annotation_prompt TEXT;

-- Level-based reference image prompts stored as JSONB {beginner, medium, expert}
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS ai_reference_prompts JSONB;
