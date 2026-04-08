-- Add AI draft feedback columns to drawing_submissions
-- These support the AI-first review workflow where AI generates draft feedback
-- (overlay annotations, corrected image prompt, written notes) when a student submits,
-- and the teacher reviews/edits before sending to the student.

ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS ai_overlay_annotations  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_corrected_image_prompt TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS corrected_image_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_draft_status TEXT DEFAULT 'pending'
    CHECK (ai_draft_status IN ('pending', 'generating', 'ready', 'failed'));
