-- ============================================
-- THE SKETCHBOOK CORRECTION LOOP
--
-- 20260921090000_nexus_sketchbook_hub.sql already put every drawing in the
-- sketchbook and linked practice to Inspiration. This adds the part a teacher
-- asked for: correct a sketch without marking it, and ask for another try.
--
-- Deliberately small. A correction already has homes: strokes in
-- drawing_annotation, the flattened overlay in reviewed_image_url, the written
-- note in tutor_feedback, the voice note in drawing_voice_feedback. Only the
-- ask itself was missing.
-- ============================================

-- 1. The ask, and its optional by-when date.
--
--    Two columns rather than a status flip. A sketch is stored
--    status='completed' from the moment it is uploaded, and only reviewed_at
--    moves, so 'redo' would fight that convention, re-enter the old review
--    queue and trip the thread guard in createDrawingSubmissionWithThread.
--    An ask is open while retry_asked_at is set and no later attempt has
--    landed on the same thread_id. Cancelling clears retry_asked_at.
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS retry_asked_at TIMESTAMPTZ;
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS retry_due_on DATE;

CREATE INDEX IF NOT EXISTS idx_ds_retry_open
  ON drawing_submissions(student_id, retry_due_on)
  WHERE retry_asked_at IS NOT NULL;

-- 2. A sketch never carries a grade. Correcting one is drawing on it, speaking
--    over it and asking for another try, never marking it. Production has 0
--    rated and 0 marked sketches, so this validates immediately.
ALTER TABLE drawing_submissions
  DROP CONSTRAINT IF EXISTS drawing_submissions_sketch_ungraded;
ALTER TABLE drawing_submissions
  ADD CONSTRAINT drawing_submissions_sketch_ungraded
  CHECK (source_type <> 'sketchbook' OR (tutor_rating IS NULL AND tutor_marks IS NULL));

-- 3. Peer reactions on the class wall reuse the gallery reaction table, which
--    already carries UNIQUE(submission_id, user_id, reaction_type). Only the
--    lookup index was missing.
CREATE INDEX IF NOT EXISTS idx_dgr_submission
  ON drawing_gallery_reactions(submission_id);

-- 4. An overdue ask is chased by the sketchbook reminder cron. It is a
--    different thing from the weekly rhythm nudge, so it gets its own kind and
--    its own idempotency key: one reminder per student per drawing, for ever.
--    The existing step_for_auto constraint already allows a null step for a
--    non-auto kind, and uq_sbr_auto_day is scoped to kind='auto', so a retry
--    reminder is never blocked by that evening's rhythm nudge.
ALTER TABLE nexus_sketchbook_reminders
  ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES drawing_submissions(id) ON DELETE CASCADE;

ALTER TABLE nexus_sketchbook_reminders
  DROP CONSTRAINT IF EXISTS nexus_sketchbook_reminders_kind_check;
ALTER TABLE nexus_sketchbook_reminders
  ADD CONSTRAINT nexus_sketchbook_reminders_kind_check
  CHECK (kind IN ('auto', 'teacher', 'retry'));

ALTER TABLE nexus_sketchbook_reminders
  DROP CONSTRAINT IF EXISTS nexus_sketchbook_reminders_retry_needs_submission;
ALTER TABLE nexus_sketchbook_reminders
  ADD CONSTRAINT nexus_sketchbook_reminders_retry_needs_submission
  CHECK ((kind = 'retry') = (submission_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS uq_sbr_retry_submission
  ON nexus_sketchbook_reminders(student_id, submission_id)
  WHERE kind = 'retry';

NOTIFY pgrst, 'reload schema';
