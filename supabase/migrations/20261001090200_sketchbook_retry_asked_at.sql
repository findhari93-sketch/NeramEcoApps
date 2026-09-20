-- ============================================
-- Corrects the shape 20261001090000 first went out with on staging.
--
-- The ask was originally expressed by flipping a sketch to status='redo'.
-- That fights the sketchbook's own convention: a sketch is stored
-- status='completed' from the moment it is uploaded and only reviewed_at ever
-- moves, so 'redo' would have re-entered the retired review queue and tripped
-- the thread guard in createDrawingSubmissionWithThread. The ask is its own
-- column instead.
--
-- Idempotent, and a no-op against a database that took 20261001090000 in its
-- current form.
-- ============================================
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS retry_asked_at TIMESTAMPTZ;

DROP INDEX IF EXISTS idx_ds_retry_open;
CREATE INDEX IF NOT EXISTS idx_ds_retry_open
  ON drawing_submissions(student_id, retry_due_on)
  WHERE retry_asked_at IS NOT NULL;

-- The practice link's index belongs to 20260921090000_nexus_sketchbook_hub,
-- which names it idx_drawing_submissions_inspiration_item. Drop the duplicate.
DROP INDEX IF EXISTS idx_ds_inspiration_item;

NOTIFY pgrst, 'reload schema';
