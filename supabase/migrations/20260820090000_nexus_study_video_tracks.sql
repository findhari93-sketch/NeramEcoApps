-- ============================================================
-- FOUNDATION BOOKS: bilingual gated video tracks on a study file
-- ------------------------------------------------------------
-- A Foundation chapter PDF was taught live in Tamil and in English. Each
-- recording becomes a TRACK: the same gated-checkpoint machinery as a class
-- recap, hung off nexus_study_files instead of nexus_scheduled_classes. A
-- student picks a language, watches it through without skipping, and clearing
-- either track satisfies the chapter's video requirement.
--
-- WHY THIS TABLE AND NOT A NEW ONE
-- nexus_class_recaps is already polymorphic. scheduled_class_id is nullable,
-- uq_class_recaps_scheduled_class is already PARTIAL, and createManualRecap
-- already writes ad-hoc rows with no class parent. A second nullable parent is
-- that same shape a second time.
--
-- It is also invisible by construction rather than by discipline. Every existing
-- read of this table is scoped by classroom_id or scheduled_class_id through
-- .eq()/.in(), and neither matches NULL in PostgREST, so a track cannot leak
-- into listRecapsForClassroom, the catch-up journey, isWatched(), the autodraft
-- sweep or the assignment joins. Nobody has to remember to filter it out.
--
-- The payoff is concrete: nexus_class_recap_stream_grants already FKs here so
-- the video audit trail needs no change, nexus_bump_recap_progress works
-- unchanged, recording-source-cache needs no new scope, and the ~1300 lines of
-- draw/gate/soft-delete logic (each carrying a bug already found and fixed once)
-- are reused rather than re-derived.
--
-- TWO PLACES THAT DO NOT FOLLOW AUTOMATICALLY, both handled in the API layer:
--   1. api/student/class-recaps/[recapId]/video-embed authorises with
--      .eq('classroom_id', recap.classroom_id), which matches NOTHING when the
--      value is NULL. That route gets a hard 404 for tracks; the track route
--      authorises by study folder audience instead.
--   2. listRecapsNeedingReview is keyed on classroom_id, so a track whose
--      generation failed would sit at readiness='held' unnoticed forever.
--      listStudyTracksNeedingReview covers it, using the index below.
-- ============================================================

ALTER TABLE nexus_class_recaps
  ADD COLUMN IF NOT EXISTS study_file_id UUID REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  -- The content-language vocabulary already used by library_videos,
  -- nexus_class_video_meta and nexus_audio_tracks.
  ADD COLUMN IF NOT EXISTS language TEXT,
  -- What the picker shows. DATA, not code, because apps/nexus has no i18n
  -- framework: "தமிழ்" cannot come from a translation catalogue that does not
  -- exist, and hardcoding it would put Tamil script in a .tsx that is otherwise
  -- entirely English. Same reason nexus_audio_tracks carries language_label.
  ADD COLUMN IF NOT EXISTS language_label TEXT;

-- Discriminator. GENERATED, never writable: a hand-maintained kind column is a
-- second source of truth that drifts from study_file_id the first time someone
-- inserts by hand, and then every query keyed on it is quietly wrong.
ALTER TABLE nexus_class_recaps
  ADD COLUMN IF NOT EXISTS kind TEXT
    GENERATED ALWAYS AS (
      CASE WHEN study_file_id IS NOT NULL THEN 'study_video' ELSE 'class_recap' END
    ) STORED;

-- A row has at most ONE parent. Without this a track could also claim a class
-- and would leak into the catch-up journey, isWatched() and the autodraft sweep.
ALTER TABLE nexus_class_recaps DROP CONSTRAINT IF EXISTS chk_class_recaps_single_parent;
ALTER TABLE nexus_class_recaps ADD CONSTRAINT chk_class_recaps_single_parent
  CHECK (scheduled_class_id IS NULL OR study_file_id IS NULL);

-- A track MUST declare its language: the picker has nothing to show otherwise
-- and the completion record cannot say which track was watched. A class recap
-- may declare one later without another migration.
ALTER TABLE nexus_class_recaps DROP CONSTRAINT IF EXISTS chk_class_recaps_language;
ALTER TABLE nexus_class_recaps ADD CONSTRAINT chk_class_recaps_language
  CHECK (
    (language IS NULL OR language IN ('en', 'ta', 'ta_en'))
    AND (study_file_id IS NULL OR language IS NOT NULL)
  );

-- One track per chapter per language. PARTIAL, exactly like
-- uq_class_recaps_scheduled_class: class recaps have both columns NULL, and a
-- plain unique index would let only one such row exist in the whole table.
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_recaps_study_file_language
  ON nexus_class_recaps(study_file_id, language)
  WHERE study_file_id IS NOT NULL;

-- "The tracks on this chapter", which the student picker and the staff editor
-- both read.
CREATE INDEX IF NOT EXISTS idx_class_recaps_study_file
  ON nexus_class_recaps(study_file_id, status)
  WHERE study_file_id IS NOT NULL;

-- The tutor review queue for tracks. idx_class_recaps_needs_review is keyed on
-- classroom_id, NULL on every track, so held tracks would never be listed.
CREATE INDEX IF NOT EXISTS idx_class_recaps_study_needs_review
  ON nexus_class_recaps(updated_at DESC)
  WHERE study_file_id IS NOT NULL AND readiness <> 'ready';

COMMENT ON COLUMN nexus_class_recaps.study_file_id IS
  'The Foundation chapter this video teaches. NULL on a class recap. Mutually exclusive with scheduled_class_id (chk_class_recaps_single_parent).';
COMMENT ON COLUMN nexus_class_recaps.language IS
  'Which language this recording was taught in: en | ta | ta_en. Required on a track; the student picks a track by this.';
COMMENT ON COLUMN nexus_class_recaps.language_label IS
  'What the picker shows, e.g. "English" or "தமிழ்". Stored because apps/nexus has no i18n framework to look it up in.';
COMMENT ON COLUMN nexus_class_recaps.kind IS
  'Generated discriminator. Never write it; it follows study_file_id.';

-- ── Transcript store, keyed on the recap rather than the class ──────────────
-- nexus_class_transcripts.class_id is a PK with an FK to nexus_scheduled_classes,
-- so a track physically cannot store its transcript there. Today the generate
-- route works around that for ad-hoc recaps by passing supabase: undefined,
-- which means every press re-pays the full Graph/SharePoint fetch. This fixes
-- that case too.
--
-- A child table rather than a TEXT column on nexus_class_recaps: a transcript
-- runs ~50KB and both listRecapsNeedingReview and listRecapsForClassroom do
-- select('*'). Same reasoning as the header of 20260730090000.
CREATE TABLE IF NOT EXISTS nexus_class_recap_transcripts (
  recap_id   UUID PRIMARY KEY REFERENCES nexus_class_recaps(id) ON DELETE CASCADE,
  vtt        TEXT,
  segments   INTEGER  NOT NULL DEFAULT 0,
  -- 'upload' | 'sharepoint' | 'graph'
  source     TEXT,
  -- 'pending' | 'ok' | 'missing' | 'failed'
  status     TEXT     NOT NULL DEFAULT 'pending',
  detail     TEXT,
  attempts   SMALLINT NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recap_transcripts_unsettled
  ON nexus_class_recap_transcripts (status) WHERE status <> 'ok';

ALTER TABLE nexus_class_recap_transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_class_recap_transcripts;
CREATE POLICY "service_role_full_access" ON nexus_class_recap_transcripts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS nexus_class_recap_transcripts_updated_at ON nexus_class_recap_transcripts;
CREATE TRIGGER nexus_class_recap_transcripts_updated_at
  BEFORE UPDATE ON nexus_class_recap_transcripts
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- No backfill. Every existing row gets study_file_id NULL, language NULL and
-- kind 'class_recap', which satisfies both new CHECKs, so neither ADD CONSTRAINT
-- can fail validation against live data.

NOTIFY pgrst, 'reload schema';
