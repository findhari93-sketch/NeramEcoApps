-- Class transcripts, stored once and read from here forever after.
--
-- Until now only a POINTER was kept (nexus_scheduled_classes.transcript_url), so
-- every press of "Generate from the class" re-fetched the transcript from Graph.
-- Worse, that fetch always failed: Node's fetch sends `Accept: */*` and Graph's
-- transcript /content endpoint answers `400 Invalid format '*/*'`, so the ladder
-- fell through to a SharePoint step whose beta `media/transcripts` endpoint no
-- longer exists either. The transcript was reachable the whole time.
--
-- Storing the text means one Graph call per class, ever. Every later read is a
-- primary-key lookup here, which is what keeps the cron from re-doing work and
-- keeps the running cost flat.
--
-- WHY A CHILD TABLE, not a column on nexus_scheduled_classes: a transcript is
-- around 50 KB, and the timetable week views select whole class rows. A text
-- column would ride along on the hottest query in the app. Out here it is only
-- read when something actually wants the transcript.

CREATE TABLE IF NOT EXISTS nexus_class_transcripts (
  class_id   UUID PRIMARY KEY REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  vtt        TEXT,
  segments   INTEGER  NOT NULL DEFAULT 0,
  source     TEXT,
  status     TEXT     NOT NULL DEFAULT 'pending',
  detail     TEXT,
  attempts   SMALLINT NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nexus_class_transcripts IS
  'One row per class once a transcript has been looked for. Holds the raw WEBVTT so no consumer ever calls Graph twice for the same class.';
COMMENT ON COLUMN nexus_class_transcripts.vtt IS
  'Raw WEBVTT exactly as Graph or the teacher supplied it. NULL while status is not ok. Raw rather than parsed cues, because parseVTT is cheap and the original stays the source of truth.';
COMMENT ON COLUMN nexus_class_transcripts.segments IS
  'Cue count from parseVTT at store time. Lets a caller judge usefulness without loading the text.';
COMMENT ON COLUMN nexus_class_transcripts.source IS
  'Which rung produced it: graph_live, cached_url, sharepoint, vtt (teacher upload) or pasted.';
COMMENT ON COLUMN nexus_class_transcripts.status IS
  'ok once stored. pending while it may still appear. unavailable once attempts ran out, which is terminal and stops further Graph calls.';
COMMENT ON COLUMN nexus_class_transcripts.detail IS
  'Why the last attempt produced nothing, for operators. NO_TRANSCRIPT, NO_ACCESS, a Graph status, or a meeting-lookup failure code.';
COMMENT ON COLUMN nexus_class_transcripts.attempts IS
  'Failed attempts. A row is written even on failure precisely so this can be capped: a class whose transcript Teams never published must stop costing calls.';

-- Drives the cron's candidate scan. Partial, so a settled class leaves the index.
CREATE INDEX IF NOT EXISTS idx_class_transcripts_unsettled
  ON nexus_class_transcripts (status)
  WHERE status <> 'ok';

-- Authorization is enforced in the API layer with the service-role client, the
-- same convention as nexus_class_images and nexus_class_tags. Lock the table to
-- service_role.
ALTER TABLE nexus_class_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_class_transcripts" ON nexus_class_transcripts;
CREATE POLICY "service_role_full_access_class_transcripts"
  ON nexus_class_transcripts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Shared trigger function, declared back in 002_application_form_enhancements.
DROP TRIGGER IF EXISTS update_nexus_class_transcripts_updated_at ON nexus_class_transcripts;
CREATE TRIGGER update_nexus_class_transcripts_updated_at
  BEFORE UPDATE ON nexus_class_transcripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
