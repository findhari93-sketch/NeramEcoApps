-- ============================================================
-- Class cover image: the one picture that stands for a class
-- ============================================================
-- Teachers already attach images to a finished class (nexus_class_images, added
-- in 20260724090000_class_capture.sql). Those images were only reachable after
-- opening a class. This lets ONE of them stand in front of the class everywhere
-- it is listed, so a student can scan a week of history and pick the class whose
-- picture draws them in.
--
-- Two additions:
--   * nexus_scheduled_classes.cover_image_id, the image the teacher starred
--   * nexus_class_images.thumb_url / thumb_path, a small copy for the tiles
--
-- Purely additive. Existing rows keep working: a class with no starred image
-- falls back to its first image, and an image with no thumb falls back to the
-- full-size url.

-- --- The starred cover --------------------------------------------------------
--
-- Why a nullable FK on the class rather than an is_cover BOOLEAN on the image:
-- a boolean needs a partial unique index plus a clear-then-set write, and
-- re-starring the image that is ALREADY the cover then trips 23505 on the
-- insert half. A single pointer cannot disagree with itself.
--
-- The class -> image -> class reference cycle is safe in both directions:
--   * INSERT has no chicken-and-egg problem, because the column is nullable and
--     is always written by a second statement, after the image row exists.
--   * Deleting one image fires SET NULL here, which is the whole point: the
--     starred picture disappearing must not leave a dangling cover.
--   * Deleting the class fires ON DELETE CASCADE on
--     nexus_class_images.scheduled_class_id first, and the SET NULL that follows
--     is a zero-row update against a class row already gone in the same
--     command. Postgres does not error on that.

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS cover_image_id UUID REFERENCES nexus_class_images(id) ON DELETE SET NULL;

-- Postgres does not index a referencing column automatically, so without this
-- every single image delete seq-scans nexus_scheduled_classes to run the SET
-- NULL. Partial, because almost every class leaves the cover unstarred.
CREATE INDEX IF NOT EXISTS idx_scheduled_classes_cover
  ON nexus_scheduled_classes(cover_image_id) WHERE cover_image_id IS NOT NULL;

-- --- Small copies for the tiles -----------------------------------------------
--
-- A whiteboard screenshot is commonly 1 to 4 MB, and the gallery now rides along
-- on every week payload. Pointing 48px tiles at the originals would cost a
-- student on mobile data tens of MB to look at one week of history.
--
-- The thumbnail is produced in the browser (canvas downscale) and uploaded next
-- to the original, so this costs storage and nothing else. Supabase image
-- transformations would do the same job server-side but bill per origin image.
--
-- Both columns are nullable: images uploaded before this migration have no
-- thumbnail, and the reader falls back to `url`.

ALTER TABLE nexus_class_images
  ADD COLUMN IF NOT EXISTS thumb_url TEXT,
  ADD COLUMN IF NOT EXISTS thumb_path TEXT;
