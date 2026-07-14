-- ============================================
-- NEXUS ASSIGNMENTS SPACE
-- Turns per-class assignments into a first-class "space": richer assignment
-- content (inline image, explainer video, external links), an attachable class
-- recording for late joiners, and a per-assignment catch-up window that drives
-- each late joiner's personal deadline. Also widens the submission format lock
-- to allow a photos-only mode (e.g. "recreate the exact JEE shape").
--
-- Additive + idempotent, follows the Course Plan v2 convention (columns only,
-- no new tables; RLS/policies already exist on nexus_class_assignments).
-- ============================================

-- 1. Richer assignment content + catch-up support on nexus_class_assignments.
--    - content_image_url : optional inline image shown with the instructions.
--    - content_video_url : optional short explainer video for the task itself.
--    - links             : [{ label, url }] external references (JEE PYQ, etc.).
--    - recording_url /
--      recording_source  : the class recording a late joiner watches before
--                          doing the assignment. When null, the app falls back
--                          to the linked nexus_scheduled_classes recording.
--    - catchup_window_days: days a late joiner gets from their join date before
--                          the assignment counts as overdue (personal clock).
ALTER TABLE nexus_class_assignments ADD COLUMN IF NOT EXISTS content_image_url TEXT;
ALTER TABLE nexus_class_assignments ADD COLUMN IF NOT EXISTS content_video_url TEXT;
ALTER TABLE nexus_class_assignments ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]';
ALTER TABLE nexus_class_assignments ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE nexus_class_assignments ADD COLUMN IF NOT EXISTS recording_source TEXT;
ALTER TABLE nexus_class_assignments ADD COLUMN IF NOT EXISTS catchup_window_days INTEGER NOT NULL DEFAULT 7;

-- recording_source is 'youtube' | 'sharepoint' when a recording is attached.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_class_assignments_recording_source_check'
      AND conrelid = 'nexus_class_assignments'::regclass
  ) THEN
    ALTER TABLE nexus_class_assignments
      ADD CONSTRAINT nexus_class_assignments_recording_source_check
      CHECK (recording_source IS NULL OR recording_source IN ('youtube', 'sharepoint'));
  END IF;
END $$;

-- 2. Widen the submission format lock to add a photos-only mode.
--    'pdf'          -> exactly one PDF (solved PYQ, etc.)
--    'image'        -> photos only (drawing recreation, hand sketches)
--    'pdf_or_image' -> one PDF OR one-to-many photos (existing default)
-- The bucket mime allowlist already covers jpeg/png/webp/pdf, so no bucket change.
ALTER TABLE nexus_class_assignments
  DROP CONSTRAINT IF EXISTS nexus_class_assignments_submission_format_check;
ALTER TABLE nexus_class_assignments
  ADD CONSTRAINT nexus_class_assignments_submission_format_check
  CHECK (submission_format IN ('pdf', 'image', 'pdf_or_image'));

-- 3. Notification event type for the multi-select Teams/email nudge fallback.
--    (Teams DM is best-effort; the in-app bell renders this table.)
ALTER TABLE nexus_timetable_notifications
  DROP CONSTRAINT IF EXISTS nexus_timetable_notifications_event_type_check;
ALTER TABLE nexus_timetable_notifications
  ADD CONSTRAINT nexus_timetable_notifications_event_type_check
  CHECK (event_type IN (
    'rsvp_attending',
    'rsvp_not_attending',
    'class_created',
    'class_cancelled',
    'class_rescheduled',
    'holiday_marked',
    'recording_available',
    'review_submitted',
    'assignment_published',
    'assignment_reviewed',
    'assignment_nudge'
  ));

-- Note: leaderboard event types ('assignment_submitted', 'assignment_ontime',
-- 'assignment_reviewed') need no schema change; gamification_point_events.event_type
-- is free text. They are added to the TypeScript enum only.
