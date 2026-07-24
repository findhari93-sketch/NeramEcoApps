-- ============================================================
-- Class Capture: AI brief, class drawings, Library-linked recording
-- ============================================================
-- After a class ends the teacher wraps it up from the timetable. This adds:
--   * a point-by-point "what we did" list on the class (summary_bullets)
--   * a gallery of drawings made in class (nexus_class_images)
--   * a link from the class to its Library row so a re-save updates the same
--     video instead of creating a duplicate (library_video_id)
--   * a marker for when Teams attendance was pulled (attendance_synced_at)
--
-- Everything else the wrap-up needs (title, description/brief, notes/detailed,
-- recording_url, youtube_url, topic_id, tags via nexus_class_tags) already
-- exists. This migration is purely additive with safe defaults.

-- --- New columns on the class -------------------------------------------------

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS summary_bullets JSONB;

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS library_video_id UUID REFERENCES library_videos(id) ON DELETE SET NULL;

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS attendance_synced_at TIMESTAMPTZ;

-- --- Class drawings gallery ---------------------------------------------------

CREATE TABLE IF NOT EXISTS nexus_class_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  storage_path TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'teams_chat')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_images_class ON nexus_class_images(scheduled_class_id);

-- Authorization is enforced in the API layer with the service-role client, the
-- same convention as nexus_class_tags. Lock the table to service_role.
ALTER TABLE nexus_class_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_class_images" ON nexus_class_images;
CREATE POLICY "service_role_full_access_class_images"
  ON nexus_class_images FOR ALL TO service_role
  USING (true) WITH CHECK (true);
