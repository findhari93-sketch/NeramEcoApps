-- ============================================================================
-- RECORDING FILE IDS: a recording survives its SharePoint folder being moved
--
-- nexus_class_recaps kept a recording only by its path URL. On 2026-09-15 the
-- NeramStorage folder nexus/class-videos was tidied into "English Class" and
-- "Tamil Class", which moved every English chapter video one level down. Every
-- stored path under the old folder went dead at once: teachers were told "Nexus
-- is not allowed to open this file" (Graph answers a dead path with 403, not
-- 404) and students could not play three published chapters.
--
-- A driveItem id does not change when the file is moved or renamed inside its
-- library, so the id is what a recording is looked up by from now on. The URL
-- stays: it is what "Open in SharePoint" links to, the fallback for rows that
-- have no ids yet, and it is rewritten to the file's current address whenever
-- the id lookup finds the file somewhere new.
--
-- Nullable. YouTube tracks and class recaps copied from the timetable have no
-- SharePoint item to point at; rows attached before this migration gain their
-- ids the next time the recordings page resolves them.
-- ============================================================================

ALTER TABLE public.nexus_class_recaps
  ADD COLUMN IF NOT EXISTS recording_drive_id text,
  ADD COLUMN IF NOT EXISTS recording_item_id text;

COMMENT ON COLUMN public.nexus_class_recaps.recording_drive_id IS
  'Graph drive id of the SharePoint recording. With recording_item_id, survives the file being moved or renamed.';
COMMENT ON COLUMN public.nexus_class_recaps.recording_item_id IS
  'Graph driveItem id of the SharePoint recording. Looked up before recording_url.';

NOTIFY pgrst, 'reload schema';
