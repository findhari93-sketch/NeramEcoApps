-- AI drawing evaluation, phase 1 schema.
--
-- The model drafts an evaluation, a teacher corrects it, and the corrections
-- are stored as structured data so later evaluations can be anchored against
-- them. See apps/nexus/Docs/AI_DRAWING_EVALUATION_BRIEF.md.
--
-- Nothing here changes drawing_submissions. In particular ai_overlay_annotations
-- stays exactly what it is today, the teacher's own region store. That column
-- already holds two incompatible shapes discriminated by duck typing at read
-- time, so AI annotations get their own table rather than becoming a third.
--
-- There is deliberately no ai_call_log table: ai_usage_events already records
-- model, tokens, cost, latency and outcome for every Gemini call in the
-- monorepo, and drawing_evaluation.id is carried into that log's context.
--
-- Every table is service-role only (RLS on, no policy), matching the rest of
-- the Nexus teacher surface. Access is gated in the API routes by
-- verifyMsToken plus a user_type check.

-- Brief types ---------------------------------------------------------------
-- A brief type is a recurring kind of drawing task, keyed on the (category,
-- sub_type) pair that drawing_questions already carries. Per-question anchoring
-- was considered and rejected: 5 anchors per question across 19 still_life
-- questions would need ~185 gradings before the first evaluation could run,
-- and the graded history averages 2 to 3 sheets per question.

CREATE TABLE IF NOT EXISTS public.drawing_brief_type (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  sub_type    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  -- A brief type is only evaluable once its criteria carry real band
  -- descriptions. The loader refuses to flip this while any band is a
  -- placeholder, so the feature cannot silently run on TODO text.
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, sub_type)
);

-- Criteria ------------------------------------------------------------------
-- What gets judged, per brief type. observable_checks are concrete verifiable
-- statements; band_descriptions is a 1..5 map in the teacher's own words.

CREATE TABLE IF NOT EXISTS public.drawing_criterion (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_type_id     UUID NOT NULL REFERENCES public.drawing_brief_type(id) ON DELETE CASCADE,
  key               TEXT NOT NULL,
  title             TEXT NOT NULL,
  observable_checks JSONB NOT NULL DEFAULT '[]',
  band_descriptions JSONB NOT NULL DEFAULT '{}',
  weight            NUMERIC(4, 2) NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brief_type_id, key)
);

CREATE INDEX IF NOT EXISTS idx_drawing_criterion_brief
  ON public.drawing_criterion (brief_type_id, sort_order);

-- Anchor sheets -------------------------------------------------------------
-- Five sheets per brief type, one per band, graded by the teacher. These are
-- the ground truth: the model is asked where a new sheet falls RELATIVE to
-- them, not for an absolute score.
--
-- image_url is denormalised on purpose. An anchor must keep showing the sheet
-- the teacher actually graded even if the submission is later rotated,
-- replaced or deleted.

CREATE TABLE IF NOT EXISTS public.drawing_anchor_sheet (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_type_id UUID NOT NULL REFERENCES public.drawing_brief_type(id) ON DELETE CASCADE,
  band          SMALLINT NOT NULL CHECK (band BETWEEN 1 AND 5),
  submission_id UUID REFERENCES public.drawing_submissions(id) ON DELETE SET NULL,
  image_url     TEXT NOT NULL,
  annotations   JSONB NOT NULL DEFAULT '[]',
  comment       TEXT,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live anchor per band per brief type. Partial so superseded anchors can
-- be kept for history rather than deleted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drawing_anchor_active_band
  ON public.drawing_anchor_sheet (brief_type_id, band)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_drawing_anchor_brief
  ON public.drawing_anchor_sheet (brief_type_id, band);

-- Evaluations ---------------------------------------------------------------
-- One row per model run against one submission. raw_response is kept so model
-- drift can be diagnosed later against the exact bytes that were returned.

CREATE TABLE IF NOT EXISTS public.drawing_evaluation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES public.drawing_submissions(id) ON DELETE CASCADE,
  brief_type_id   UUID REFERENCES public.drawing_brief_type(id) ON DELETE SET NULL,
  -- draft:        the model answered and it validated
  -- needs_manual: refused, failed twice, or failed validation. Never a
  --               half-parsed record.
  -- reviewed:     a teacher has been through it
  -- released:     the corrected result reached the student
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'needs_manual', 'reviewed', 'released')),
  provider        TEXT NOT NULL DEFAULT 'gemini',
  model_id        TEXT,
  prompt_version  TEXT NOT NULL,
  raw_response    JSONB,
  error           TEXT,
  ai_total        NUMERIC(5, 2),
  final_total     NUMERIC(5, 2),
  overall_comment TEXT,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_drawing_evaluation_submission
  ON public.drawing_evaluation (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drawing_evaluation_status
  ON public.drawing_evaluation (status, created_at DESC);

-- Per-criterion result ------------------------------------------------------
-- was_corrected is the headline training signal: it separates the bands the
-- teacher accepted from the ones they overrode.

CREATE TABLE IF NOT EXISTS public.drawing_evaluation_criterion (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id       UUID NOT NULL REFERENCES public.drawing_evaluation(id) ON DELETE CASCADE,
  criterion_key       TEXT NOT NULL,
  ai_band             SMALLINT CHECK (ai_band BETWEEN 1 AND 5),
  final_band          SMALLINT CHECK (final_band BETWEEN 1 AND 5),
  confidence          TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  closest_anchor_band SMALLINT CHECK (closest_anchor_band BETWEEN 1 AND 5),
  reasoning           TEXT,
  was_corrected       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (evaluation_id, criterion_key)
);

-- Annotations ---------------------------------------------------------------
-- Vectors, never flattened pixels. Flattening happens for display and for a
-- future training export, not for storage.
--
-- geometry is ALWAYS image-relative and normalised 0 to 1, origin top-left:
-- region is [x, y, w, h], point is [x, y], line and stroke are [[x, y], ...].
-- Providers differ ([x0,y0,x1,y1] vs [x,y,w,h], normalised vs pixel absolute),
-- so normalisation happens in the adapter and nowhere else. Raw provider
-- coordinates reaching this table would make the whole correction history
-- provider-locked and worthless on a model switch.
--
-- source plus action is the rest of the training signal: it records not just
-- that the teacher disagreed but where and how.

CREATE TABLE IF NOT EXISTS public.drawing_annotation (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.drawing_evaluation(id) ON DELETE CASCADE,
  criterion_key TEXT,
  source        TEXT NOT NULL CHECK (source IN ('ai', 'human')),
  action        TEXT NOT NULL DEFAULT 'created'
                CHECK (action IN ('created', 'moved', 'deleted', 'kept')),
  kind          TEXT NOT NULL DEFAULT 'region'
                CHECK (kind IN ('region', 'point', 'line', 'stroke')),
  geometry      JSONB NOT NULL,
  marker        TEXT NOT NULL DEFAULT 'note'
                CHECK (marker IN ('problem', 'good', 'guide', 'note')),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawing_annotation_evaluation
  ON public.drawing_annotation (evaluation_id);

-- Access --------------------------------------------------------------------
-- Service role only. The API routes are the access boundary.

ALTER TABLE public.drawing_brief_type            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_criterion             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_anchor_sheet          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_evaluation            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_evaluation_criterion  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_annotation            ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.drawing_brief_type IS
  'Recurring drawing task types, keyed on (category, sub_type) from drawing_questions.';
COMMENT ON TABLE public.drawing_anchor_sheet IS
  'Five teacher-graded reference sheets per brief type, one per band. The ground truth for relative scoring.';
COMMENT ON COLUMN public.drawing_annotation.geometry IS
  'Image-relative, normalised 0-1, origin top-left. Never provider-raw, never stage-relative.';
