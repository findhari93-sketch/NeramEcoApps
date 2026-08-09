-- The name of the file a recording actually points at.
--
-- The dialog derives a name from the URL (lib/chapter-recordings.describeRecordingUrl),
-- which is right for a plain SharePoint path and wrong for the shapes teachers
-- actually paste. A recording picked out of a SharePoint list answers
-- "DispForm.aspx", the name of the list form page rather than the video, and a
-- share link ends in an opaque token with no name in it at all. Both leave the
-- teacher looking at a row that cannot tell them which file it holds.
--
-- Nullable and never backfilled on purpose. The derived name stays as the
-- fallback, so every recording attached before this column existed keeps reading
-- exactly as it did, and nothing has to be migrated. The column is filled from
-- the driveItem the playback preflight ALREADY resolves on every attach, so it
-- costs no extra Graph call.

ALTER TABLE nexus_class_recaps
  ADD COLUMN IF NOT EXISTS recording_file_name TEXT;

COMMENT ON COLUMN nexus_class_recaps.recording_file_name IS
  'Real file name of recording_url, from the Graph driveItem. NULL falls back to the name derived from the URL.';
