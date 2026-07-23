-- ============================================
-- TIMETABLE PLANNER: CLASS-TO-ASSIGNMENT LINK + DRAFT WEEKS
--
-- Two gaps this closes:
--
-- 1. Assignments were never linked to the class they were given in. They carried
--    a loose `class_date` and a course-plan entry, so a teacher standing in the
--    timetable had no way to attach one, and a student looking at a class could
--    not see what it asked of them.
--
-- 2. Every class went live the moment it was created, so students watched a
--    half-planned week appear one notification at a time. `publish_state` lets
--    a teacher build the week privately and release it in one go.
--
-- Additive and idempotent.
-- ============================================

-- 1. The link. classroom_id remains the survival anchor (CASCADE); the class is
--    context (SET NULL), matching the plan/entry/topic convention already used
--    on this table: a marked submission must never disappear because the class
--    it belonged to was deleted.
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS scheduled_class_id UUID
  REFERENCES nexus_scheduled_classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_assignments_scheduled_class
  ON nexus_class_assignments(scheduled_class_id);

-- 2. Draft weeks.
--
--    DEFAULT 'published' is deliberate: every existing class, and every class
--    imported from Teams by the sync, stays visible to students exactly as
--    before. Only the new planner ever writes 'draft', so this migration cannot
--    make anything disappear.
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS publish_state TEXT NOT NULL DEFAULT 'published';
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_scheduled_classes_publish_state_check'
      AND conrelid = 'nexus_scheduled_classes'::regclass
  ) THEN
    ALTER TABLE nexus_scheduled_classes
      ADD CONSTRAINT nexus_scheduled_classes_publish_state_check
      CHECK (publish_state IN ('draft', 'published'));
  END IF;
END $$;

-- Students filter on this every load, alongside the date range.
CREATE INDEX IF NOT EXISTS idx_scheduled_classes_publish_state
  ON nexus_scheduled_classes(classroom_id, publish_state, scheduled_date);

-- 3. Per-class switch for the recording auto-sync (the design's toggle in the
--    editing panel). Default on: the sync already runs for everything today.
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS auto_sync_recording BOOLEAN NOT NULL DEFAULT true;

-- 4. Backfill published_at so "when did students first see this" is answerable
--    for classes that predate the column. Their creation time is the honest
--    answer: they were visible from the moment they existed.
UPDATE nexus_scheduled_classes
SET published_at = created_at
WHERE published_at IS NULL AND publish_state = 'published';

-- 5. Notification event type for the single "week published" summary that
--    replaces one class_created notification per class.
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
    'assignment_nudge',
    'week_published'
  ));
