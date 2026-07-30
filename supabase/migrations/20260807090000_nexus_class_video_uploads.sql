-- The YouTube backup job for one class, so a 400 MB upload can survive being
-- cut off by a serverless function's clock.
--
-- Teams keeps a class recording for about six months and then it is gone, so the
-- durable copy is a YouTube upload. That upload is the most expensive thing this
-- app does: 1600 of a 10,000-unit daily quota per video, and the units are
-- charged the MOMENT the resumable session is created, long before a single byte
-- moves. Six failed starts is a whole day's quota spent on nothing.
--
-- Which is why this table exists at all. It is not a log. `upload_session_uri`
-- and `bytes_uploaded` are the ONLY things that let a run which ran out of wall
-- clock at 80% pick up where it left off instead of paying 1600 again. Losing
-- this row means paying twice.
--
-- Shaped after nexus_class_transcripts (migration 20260730090000) on purpose:
-- keyed on the class, an attempt cap that goes terminal, a `detail` an operator
-- can grep, and a partial index so a settled class leaves the index. The cron's
-- candidate scan is the same anti-join, so the two sweeps read alike.

CREATE TABLE IF NOT EXISTS nexus_class_video_uploads (
  class_id           UUID PRIMARY KEY
                       REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,

  status             TEXT     NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','uploading','ok','unavailable','skipped')),
  detail             TEXT,
  attempts           SMALLINT NOT NULL DEFAULT 0,

  -- The resumable session. Google hands this back in the Location header of the
  -- initiate POST, and it is the receipt for 1600 quota units already spent.
  upload_session_uri TEXT,
  session_started_at TIMESTAMPTZ,

  -- Must equal the Graph driveItem size exactly: it is what went into
  -- X-Upload-Content-Length, and Google rejects a total that disagrees.
  file_size          BIGINT,
  bytes_uploaded     BIGINT   NOT NULL DEFAULT 0,

  -- Graph driveItem id, so a resume can re-resolve a fresh pre-authenticated
  -- download URL without re-parsing the share link. The URL itself is NEVER
  -- stored: it expires in under an hour and a stale one 403s in a way that reads
  -- exactly like a dead upload session.
  source_item_id     TEXT,

  youtube_video_id   TEXT,
  -- What was actually sent, not what we would send today. When the compliance
  -- audit lands and the constant flips to 'unlisted', this is how you find the
  -- back catalogue that is still private.
  privacy_status     TEXT,
  uploaded_at        TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nexus_class_video_uploads IS
  'One row per class once a YouTube backup has been attempted. Holds the resumable session so a part-finished 400 MB upload is never restarted from zero.';
COMMENT ON COLUMN nexus_class_video_uploads.upload_session_uri IS
  'Google resumable session URI from the initiate POST Location header. Worth 1600 quota units: losing it means paying again. Cleared on success or on a 404/410 dead session.';
COMMENT ON COLUMN nexus_class_video_uploads.bytes_uploaded IS
  'Offset as last CONFIRMED BY GOOGLE via a 308 Range header, never what we believe we sent. A 308 reporting fewer bytes than we sent is the one failure that silently corrupts a video.';
COMMENT ON COLUMN nexus_class_video_uploads.attempts IS
  'Failed attempts. Capped at 4, lower than the transcript sweep, because each failure can cost 1600 quota units. A quotaExceeded stop does NOT count: that is a property of the day, not of the class.';
COMMENT ON COLUMN nexus_class_video_uploads.status IS
  'ok once the video id is back, and terminal. uploading means a paid-for session is part-done and MUST be resumed before any new upload starts. unavailable once attempts ran out. skipped when a human already supplied a youtube_url.';
COMMENT ON COLUMN nexus_class_video_uploads.source_item_id IS
  'Graph driveItem id of the source mp4. Stored so a resume can mint a fresh download URL; the download URL itself is deliberately never persisted.';
COMMENT ON COLUMN nexus_class_video_uploads.session_started_at IS
  'When the 1600 units were charged. Drives both the per-day quota count and the 24h abandonment rule for a session Google has since forgotten.';

-- Drives the cron's candidate scan. Partial, so a settled class leaves the index.
CREATE INDEX IF NOT EXISTS idx_class_video_uploads_unsettled
  ON nexus_class_video_uploads (status)
  WHERE status IN ('pending', 'uploading');

-- Quota accounting counts SESSIONS STARTED, not uploads finished, because that
-- is the instant the 1600 units are charged.
CREATE INDEX IF NOT EXISTS idx_class_video_uploads_session_started
  ON nexus_class_video_uploads (session_started_at)
  WHERE session_started_at IS NOT NULL;

-- Two rows pointing at one video means we paid 3200 units and made a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_video_uploads_video_id
  ON nexus_class_video_uploads (youtube_video_id)
  WHERE youtube_video_id IS NOT NULL;

-- Authorization is enforced in the API layer with the service-role client, the
-- same convention as nexus_class_transcripts and nexus_class_video_meta.
ALTER TABLE nexus_class_video_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_class_video_uploads" ON nexus_class_video_uploads;
CREATE POLICY "service_role_full_access_class_video_uploads"
  ON nexus_class_video_uploads FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Shared trigger function, declared back in 002_application_form_enhancements.
DROP TRIGGER IF EXISTS update_nexus_class_video_uploads_updated_at ON nexus_class_video_uploads;
CREATE TRIGGER update_nexus_class_video_uploads_updated_at
  BEFORE UPDATE ON nexus_class_video_uploads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
