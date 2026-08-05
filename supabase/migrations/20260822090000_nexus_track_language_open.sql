-- ============================================================
-- FOUNDATION TRACKS: let the language list grow without a migration
-- ------------------------------------------------------------
-- 20260820090000 pinned the vocabulary in the constraint itself:
--
--   CHECK (language IS NULL OR language IN ('en', 'ta', 'ta_en'))
--
-- which made "offer this chapter in Hindi too" a schema change, a deploy and
-- five separate code edits, for what is a content decision a teacher should be
-- able to make on a Tuesday afternoon. The offered list now lives in
-- nexus_settings under `study_track_languages`, the same table and shape as
-- `feature_flags` and `recap_defaults`, and is edited from the Class recordings
-- dialog.
--
-- So this constraint stops describing the vocabulary and starts describing the
-- SHAPE. It still refuses the things that actually hurt: an empty string, a
-- sentence, mixed case that would then fail every case-sensitive PostgREST .eq
-- against it, and anything long enough to suggest a free-text label leaked into
-- the code column. What it no longer does is decide which languages exist.
--
-- Two or three lowercase letters, optionally joined by underscores, which
-- covers ISO 639-1 ('en', 'ta', 'hi', 'ml', 'te'), the odd 639-2 code, and the
-- compound form already in use for a class taught in both ('ta_en').
--
-- Every existing row satisfies this: class recaps carry NULL, and the only
-- track languages ever written are 'en', 'ta' and 'ta_en'. So ADD CONSTRAINT
-- cannot fail validation against live data and needs no NOT VALID dance.
-- ============================================================

ALTER TABLE nexus_class_recaps DROP CONSTRAINT IF EXISTS chk_class_recaps_language;
ALTER TABLE nexus_class_recaps ADD CONSTRAINT chk_class_recaps_language
  CHECK (
    (language IS NULL OR language ~ '^[a-z]{2,3}(_[a-z]{2,3})*$')
    -- Unchanged, and the half that still matters most: a track MUST declare a
    -- language. The picker has nothing to show otherwise and the completion
    -- record cannot say which recording was watched.
    AND (study_file_id IS NULL OR language IS NOT NULL)
  );

COMMENT ON COLUMN nexus_class_recaps.language IS
  'Which language this recording was taught in, e.g. en | ta | ta_en | hi. Required on a track; the student picks a track by this. Which codes are OFFERED is nexus_settings.study_track_languages, not this constraint, which only checks the shape.';

NOTIFY pgrst, 'reload schema';
