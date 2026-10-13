-- ============================================
-- NEXUS: WATCH BEFORE CLASS
--
-- A teacher scheduling a class can attach a few videos for students to watch
-- before it: a Library video (old YouTube classes) or the recording of a past
-- Nexus class from any classroom. Optional, never a gate, but tracked, so the
-- teacher sees "12 of 30 watched" and each student sees their own tick.
--
-- Two decisions worth knowing before changing this:
--
--   1. Attachments ride on nexus_class_resources as two new kinds, so they get
--      the class cascade, the per-class cap and the reorder for free. Readers of
--      reference material filter these kinds out; they are a separate section.
--
--   2. Views are keyed by the VIDEO, not by the attachment. A class repeated
--      weekly, or held in three classrooms, carries one attachment row per
--      class; watching the video once must tick all of them.
--
-- The second foreign key from nexus_class_resources to nexus_scheduled_classes
-- (source_class_id) makes an un-hinted PostgREST embed between the two tables
-- ambiguous (PGRST201). Every embed in the app now names
-- nexus_class_resources_scheduled_class_id_fkey explicitly, and that change
-- must ship with this migration.
--
-- Idempotent.
-- ============================================

-- 1. POINTERS ON THE ATTACHMENT
ALTER TABLE nexus_class_resources
  ADD COLUMN IF NOT EXISTS library_video_id UUID REFERENCES library_videos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_class_id UUID REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_class_resources_duration_check'
      AND conrelid = 'nexus_class_resources'::regclass
  ) THEN
    ALTER TABLE nexus_class_resources
      ADD CONSTRAINT nexus_class_resources_duration_check
      CHECK (duration_seconds IS NULL OR duration_seconds >= 0);
  END IF;
END $$;

COMMENT ON COLUMN nexus_class_resources.library_video_id IS
  'Set only on kind library_video: the Library video a student should watch before this class.';
COMMENT ON COLUMN nexus_class_resources.source_class_id IS
  'Set only on kind class_recording: the PAST class whose recording a student should watch before this class. Students play it through this row, never through the source class, so a student of another classroom can watch it.';
COMMENT ON COLUMN nexus_class_resources.duration_seconds IS
  'Video length snapshotted at attach time, so "watched" (80 percent of real playback) has something to take 80 percent of.';

-- 2. KINDS
ALTER TABLE nexus_class_resources DROP CONSTRAINT IF EXISTS nexus_class_resources_kind_check;
ALTER TABLE nexus_class_resources ADD CONSTRAINT nexus_class_resources_kind_check
  CHECK (kind IN ('youtube', 'link', 'image', 'study_file', 'library_video', 'class_recording'));

-- 3. SHAPE: each kind carries exactly its own pointer.
ALTER TABLE nexus_class_resources DROP CONSTRAINT IF EXISTS nexus_class_resources_shape_check;
ALTER TABLE nexus_class_resources ADD CONSTRAINT nexus_class_resources_shape_check CHECK (
     (kind = 'study_file' AND study_file_id IS NOT NULL
        AND library_video_id IS NULL AND source_class_id IS NULL)
  OR (kind IN ('youtube', 'link', 'image') AND url IS NOT NULL
        AND library_video_id IS NULL AND source_class_id IS NULL)
  OR (kind = 'library_video' AND library_video_id IS NOT NULL AND source_class_id IS NULL)
  OR (kind = 'class_recording' AND source_class_id IS NOT NULL AND library_video_id IS NULL
        AND source_class_id <> scheduled_class_id)
);

-- 4. INDEXES
-- The same video twice on one class is a mistake, never an intent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_resources_library_video
  ON nexus_class_resources(scheduled_class_id, library_video_id)
  WHERE library_video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_resources_source_class
  ON nexus_class_resources(scheduled_class_id, source_class_id)
  WHERE source_class_id IS NOT NULL;
-- Back the ON DELETE CASCADE lookups, which would otherwise scan the table.
CREATE INDEX IF NOT EXISTS idx_class_resources_library_video_fk
  ON nexus_class_resources(library_video_id)
  WHERE library_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_class_resources_source_class_fk
  ON nexus_class_resources(source_class_id)
  WHERE source_class_id IS NOT NULL;

-- 5. PER-STUDENT VIEWS, keyed by the video
CREATE TABLE IF NOT EXISTS nexus_class_video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  library_video_id UUID REFERENCES library_videos(id) ON DELETE CASCADE,
  source_class_id UUID REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  furthest_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  completed_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nexus_class_video_views_one_video CHECK (num_nonnulls(library_video_id, source_class_id) = 1)
);

COMMENT ON TABLE nexus_class_video_views IS
  'How much of each "watch before class" video a student has played. Keyed by the video, not the attachment, so one watch ticks every class it is attached to. Written only by nexus_bump_class_video_view.';
COMMENT ON COLUMN nexus_class_video_views.watched_seconds IS
  'Real playback accumulated from heartbeats, never the scrub position. Watched means at least 80 percent of duration_seconds.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_video_views_library
  ON nexus_class_video_views(student_id, library_video_id)
  WHERE library_video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_video_views_class
  ON nexus_class_video_views(student_id, source_class_id)
  WHERE source_class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_class_video_views_library_fk
  ON nexus_class_video_views(library_video_id)
  WHERE library_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_class_video_views_class_fk
  ON nexus_class_video_views(source_class_id)
  WHERE source_class_id IS NOT NULL;

ALTER TABLE nexus_class_video_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access_class_video_views" ON nexus_class_video_views;
CREATE POLICY "service_role_full_access_class_video_views"
  ON nexus_class_video_views FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 6. HEARTBEAT
-- Authorises through the attachment: the resource must sit on the class named
-- and the student must be actively enrolled in that class's classroom. A
-- request that fails either check is dropped silently, like a stale beacon.
--
-- The delta cap is 120, not the recap's 60: the client flushes every 30
-- seconds, and 30 seconds at 2x speed is 60 seconds of genuine playback.
CREATE OR REPLACE FUNCTION nexus_bump_class_video_view(
  p_student UUID,
  p_class UUID,
  p_resource UUID,
  p_pos INTEGER,
  p_watched_delta INTEGER DEFAULT 0,
  p_duration INTEGER DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_pos INTEGER := GREATEST(COALESCE(p_pos, 0), 0);
  v_delta INTEGER := LEAST(GREATEST(COALESCE(p_watched_delta, 0), 0), 120);
  v_dur INTEGER;
BEGIN
  SELECT res.library_video_id, res.source_class_id, res.duration_seconds
    INTO r
  FROM nexus_class_resources res
  JOIN nexus_scheduled_classes c ON c.id = res.scheduled_class_id
  JOIN nexus_enrollments e
    ON e.classroom_id = c.classroom_id
   AND e.user_id = p_student
   AND e.is_active = true
  WHERE res.id = p_resource
    AND res.scheduled_class_id = p_class
    AND res.kind IN ('library_video', 'class_recording')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_dur := COALESCE(NULLIF(r.duration_seconds, 0), NULLIF(p_duration, 0));

  IF r.library_video_id IS NOT NULL THEN
    INSERT INTO nexus_class_video_views (
      student_id, library_video_id, watched_seconds, furthest_seconds, duration_seconds
    ) VALUES (p_student, r.library_video_id, v_delta, v_pos, v_dur)
    ON CONFLICT (student_id, library_video_id) WHERE library_video_id IS NOT NULL
    DO UPDATE SET
      watched_seconds = nexus_class_video_views.watched_seconds + v_delta,
      furthest_seconds = GREATEST(nexus_class_video_views.furthest_seconds, v_pos),
      duration_seconds = COALESCE(nexus_class_video_views.duration_seconds, v_dur),
      last_seen_at = now();

    UPDATE nexus_class_video_views
    SET completed_at = now()
    WHERE student_id = p_student
      AND library_video_id = r.library_video_id
      AND completed_at IS NULL
      AND COALESCE(duration_seconds, 0) > 0
      AND watched_seconds >= 0.8 * duration_seconds;
  ELSE
    INSERT INTO nexus_class_video_views (
      student_id, source_class_id, watched_seconds, furthest_seconds, duration_seconds
    ) VALUES (p_student, r.source_class_id, v_delta, v_pos, v_dur)
    ON CONFLICT (student_id, source_class_id) WHERE source_class_id IS NOT NULL
    DO UPDATE SET
      watched_seconds = nexus_class_video_views.watched_seconds + v_delta,
      furthest_seconds = GREATEST(nexus_class_video_views.furthest_seconds, v_pos),
      duration_seconds = COALESCE(nexus_class_video_views.duration_seconds, v_dur),
      last_seen_at = now();

    UPDATE nexus_class_video_views
    SET completed_at = now()
    WHERE student_id = p_student
      AND source_class_id = r.source_class_id
      AND completed_at IS NULL
      AND COALESCE(duration_seconds, 0) > 0
      AND watched_seconds >= 0.8 * duration_seconds;
  END IF;

  -- Fill a missing length from the player, never overwrite a known one.
  IF r.duration_seconds IS NULL AND p_duration IS NOT NULL AND p_duration > 0 THEN
    UPDATE nexus_class_resources SET duration_seconds = p_duration WHERE id = p_resource;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION nexus_bump_class_video_view(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';
