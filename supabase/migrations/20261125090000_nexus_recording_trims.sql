-- Recording trims: silent stretches removed from class recordings.
--
-- Students asked for it: a recording starts with the teacher waiting for people
-- to join and has dead stretches in the middle, and catch-up made them sit
-- through all of it. Across 30 recent classes speech started 5 to 20 minutes in
-- and 15 to 34% of each recording was silent.
--
-- A GitHub Actions worker (scripts/recording-trim) measures each recording with
-- ffmpeg, Nexus plans the cuts (apps/nexus/src/lib/recording-trim-plan.ts), the
-- worker cuts and uploads a trimmed copy beside the original in SharePoint, and
-- Nexus applies it. The original is never touched: nexus_scheduled_classes.
-- recording_url stays the Teams file, and the trimmed copy is a separate
-- pointer, so "Use original" is always one switch away while the original
-- exists.
--
-- Applying moves everything timed on the original onto the trimmed copy in one
-- transaction (nexus_apply_recording_trim): checkpoint times, the transcript,
-- YouTube chapters, and every student's resume point and played stretches.
-- nexus_class_recaps.timeline_version goes up, so a player still open on the
-- old timeline is told to reload instead of saving positions that no longer
-- mean anything.

CREATE TABLE IF NOT EXISTS nexus_recording_trims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL UNIQUE REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',      -- waiting for the worker
    'running',     -- claimed by a worker run
    'dry_run',     -- measured and planned only (dry-run mode)
    'ready',       -- trimmed copy uploaded, waiting for the overnight apply window
    'applied',     -- students are watching the trimmed copy
    'skipped',     -- nothing worth cutting, or a guard refused
    'failed',      -- gave up after retries
    'reverted',    -- staff chose "Use original"
    'superseded'   -- the class's recording was replaced after trimming
  )),
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'new' CHECK (source IN ('new', 'backlog', 'manual')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  claim_expires_at TIMESTAMPTZ,
  worker_run TEXT,
  original_url TEXT NOT NULL,
  original_drive_id TEXT,
  original_item_id TEXT,
  original_size BIGINT,
  original_duration_seconds NUMERIC,
  trimmed_url TEXT,
  trimmed_drive_id TEXT,
  trimmed_item_id TEXT,
  trimmed_size BIGINT,
  trimmed_duration_seconds NUMERIC,
  detection JSONB,
  plan JSONB,
  cut_map JSONB,
  removed_seconds NUMERIC,
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  reverted_at TIMESTAMPTZ,
  reverted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recording_trims_status ON nexus_recording_trims (status, created_at);

-- Service role only, like the rest of the Nexus surface (MSAL, so auth.uid() is
-- always null and a policy would be dead code).
ALTER TABLE nexus_recording_trims ENABLE ROW LEVEL SECURITY;

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS recording_trim_id UUID REFERENCES nexus_recording_trims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recording_trimmed_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_trim_state TEXT,
  ADD COLUMN IF NOT EXISTS recording_trim_removed_seconds INTEGER;

COMMENT ON COLUMN nexus_scheduled_classes.recording_trimmed_url IS
  'The trimmed copy students play when recording_trim_state = applied. recording_url stays the Teams original.';

ALTER TABLE nexus_class_transcripts
  ADD COLUMN IF NOT EXISTS vtt_original TEXT;

COMMENT ON COLUMN nexus_class_transcripts.vtt_original IS
  'The transcript on the original timeline, kept while vtt holds the trimmed-timeline copy. NULL when untrimmed.';

ALTER TABLE nexus_class_recaps
  ADD COLUMN IF NOT EXISTS timeline_version INTEGER NOT NULL DEFAULT 0;

-- The YouTube backup of a class trimmed after it was uploaded is uploaded again
-- from the trimmed copy ('reupload'), and the old video is made private once the
-- new one is published (replaced_video_id).
ALTER TABLE nexus_class_video_uploads
  ADD COLUMN IF NOT EXISTS source_variant TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS replaced_video_id TEXT;

ALTER TABLE nexus_class_video_uploads DROP CONSTRAINT IF EXISTS nexus_class_video_uploads_status_check;
ALTER TABLE nexus_class_video_uploads ADD CONSTRAINT nexus_class_video_uploads_status_check
  CHECK (status IN ('pending', 'uploading', 'ok', 'unavailable', 'skipped', 'reupload'));

-- One worker run takes one job. SKIP LOCKED so two overlapping runs never take
-- the same class; an expired claim (a runner that died) is taken back.
CREATE OR REPLACE FUNCTION nexus_claim_recording_trim(p_worker TEXT)
RETURNS SETOF nexus_recording_trims
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM nexus_recording_trims
  WHERE status = 'queued'
     OR (status = 'running' AND claim_expires_at < now())
     OR (status = 'failed' AND attempts < 3 AND updated_at < now() - interval '30 minutes')
  ORDER BY (source = 'new') DESC, created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE nexus_recording_trims
  SET status = 'running',
      attempts = attempts + 1,
      claimed_at = now(),
      claim_expires_at = now() + interval '50 minutes',
      worker_run = p_worker,
      updated_at = now()
  WHERE id = v_id
  RETURNING *;
END;
$$;

-- Switch a class onto its trimmed copy, or back, in one transaction. Nexus
-- computes every moved time (apps/nexus/src/lib/recording-trim-apply.ts); this
-- writes them all or none. p_payload:
--   { mode: 'apply' | 'revert',
--     class: { trimmed_url, state, removed_seconds, duration_minutes },
--     vtt: text | null,                  -- the transcript to serve
--     recaps: [{ id, recording_url, drive_id, item_id, duration_seconds,
--                sections: [{ id, start, end }],
--                progress: [{ student_id, version, pos, furthest, ranges }] }],
--     chapters: jsonb | null }
-- A progress row whose watch_version moved since Nexus read it is left alone and
-- reported, so a heartbeat that slipped in between is never overwritten.
CREATE OR REPLACE FUNCTION nexus_apply_recording_trim(p_trim UUID, p_payload JSONB, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trim nexus_recording_trims%ROWTYPE;
  v_mode TEXT := p_payload->>'mode';
  v_recap JSONB;
  v_section JSONB;
  v_prog JSONB;
  v_rows INTEGER;
  v_conflicts INTEGER := 0;
BEGIN
  SELECT * INTO v_trim FROM nexus_recording_trims WHERE id = p_trim FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trim % not found', p_trim;
  END IF;

  UPDATE nexus_scheduled_classes
  SET recording_trim_id = p_trim,
      recording_trimmed_url = p_payload->'class'->>'trimmed_url',
      recording_trim_state = p_payload->'class'->>'state',
      recording_trim_removed_seconds = (p_payload->'class'->>'removed_seconds')::numeric::int,
      recording_duration_minutes = COALESCE((p_payload->'class'->>'duration_minutes')::numeric, recording_duration_minutes)
  WHERE id = v_trim.class_id;

  IF p_payload ? 'vtt' AND p_payload->>'vtt' IS NOT NULL THEN
    UPDATE nexus_class_transcripts
    SET vtt_original = CASE WHEN v_mode = 'apply' THEN COALESCE(vtt_original, vtt) ELSE NULL END,
        vtt = p_payload->>'vtt',
        updated_at = now()
    WHERE class_id = v_trim.class_id;
  END IF;

  FOR v_recap IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'recaps', '[]'::jsonb)) LOOP
    UPDATE nexus_class_recaps
    SET recording_url = v_recap->>'recording_url',
        recording_drive_id = v_recap->>'drive_id',
        recording_item_id = v_recap->>'item_id',
        video_duration_seconds = (v_recap->>'duration_seconds')::numeric::int,
        timeline_version = timeline_version + 1,
        updated_at = now()
    WHERE id = (v_recap->>'id')::uuid;

    FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_recap->'sections', '[]'::jsonb)) LOOP
      UPDATE nexus_class_recap_sections
      SET start_timestamp_seconds = (v_section->>'start')::numeric,
          end_timestamp_seconds = (v_section->>'end')::numeric
      WHERE id = (v_section->>'id')::uuid;
    END LOOP;

    FOR v_prog IN SELECT * FROM jsonb_array_elements(COALESCE(v_recap->'progress', '[]'::jsonb)) LOOP
      UPDATE nexus_class_recap_progress
      SET last_video_position_seconds = (v_prog->>'pos')::numeric::int,
          furthest_position_seconds = (v_prog->>'furthest')::numeric::int,
          played_ranges = v_prog->'ranges',
          -- Baselines are per viewing session on the old timeline; a fresh
          -- session starts clean on the new one.
          watch_sessions = '{}'::jsonb,
          watch_version = watch_version + 1
      WHERE recap_id = (v_recap->>'id')::uuid
        AND student_id = (v_prog->>'student_id')::uuid
        AND watch_version = (v_prog->>'version')::int;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        v_conflicts := v_conflicts + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF p_payload ? 'chapters' AND p_payload->'chapters' IS NOT NULL AND jsonb_typeof(p_payload->'chapters') = 'array' THEN
    UPDATE nexus_class_video_meta SET chapters = p_payload->'chapters', updated_at = now() WHERE scheduled_class_id = v_trim.class_id;
  END IF;

  IF v_conflicts > 0 THEN
    -- Someone was watching while this ran. Undo everything; Nexus retries with
    -- fresh numbers.
    RAISE EXCEPTION 'PROGRESS_CONFLICT %', v_conflicts;
  END IF;

  UPDATE nexus_recording_trims
  SET status = CASE WHEN v_mode = 'apply' THEN 'applied' ELSE 'reverted' END,
      applied_at = CASE WHEN v_mode = 'apply' THEN now() ELSE applied_at END,
      applied_by = CASE WHEN v_mode = 'apply' THEN p_actor ELSE applied_by END,
      reverted_at = CASE WHEN v_mode = 'revert' THEN now() ELSE reverted_at END,
      reverted_by = CASE WHEN v_mode = 'revert' THEN p_actor ELSE reverted_by END,
      updated_at = now()
  WHERE id = p_trim;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- A recording replaced after trimming (a teacher re-linked it, a re-sync found
-- a newer file) makes the trimmed copy wrong. Drop the pointer and the
-- remapped transcript; the replacement flows re-snapshot the recap.
CREATE OR REPLACE FUNCTION nexus_recording_url_supersedes_trim()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.recording_url IS DISTINCT FROM OLD.recording_url AND OLD.recording_trim_id IS NOT NULL THEN
    NEW.recording_trimmed_url := NULL;
    NEW.recording_trim_state := 'superseded';
    UPDATE nexus_recording_trims SET status = 'superseded', updated_at = now() WHERE id = OLD.recording_trim_id;
    UPDATE nexus_class_transcripts
    SET vtt = COALESCE(vtt_original, vtt), vtt_original = NULL
    WHERE class_id = NEW.id AND vtt_original IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recording_url_supersedes_trim ON nexus_scheduled_classes;
CREATE TRIGGER trg_recording_url_supersedes_trim
  BEFORE UPDATE OF recording_url ON nexus_scheduled_classes
  FOR EACH ROW EXECUTE FUNCTION nexus_recording_url_supersedes_trim();

REVOKE EXECUTE ON FUNCTION nexus_claim_recording_trim(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_claim_recording_trim(TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION nexus_apply_recording_trim(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_apply_recording_trim(UUID, JSONB, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION nexus_recording_url_supersedes_trim() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
