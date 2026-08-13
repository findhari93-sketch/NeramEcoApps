-- Nexus Study Materials: personal PDF annotations (Pen, Highlighter, Sticky Note).
--
-- The PDF reader (PDFReader.tsx) renders every page to an opaque <canvas> via pdf.js
-- specifically to avoid a selectable text layer (anti-piracy). So annotations are ink,
-- not text-selection ranges: one row per freehand stroke or sticky note, anchored with
-- fractional (0..1) page coordinates so they survive the reader's auto-fit-to-width
-- rescaling with no server-side recomputation.
--
-- A "sticky note" is simply kind='note' with points=NULL and a required note_text.
-- A pen/highlighter stroke can optionally carry note_text too (a margin comment on a
-- mark), so one table covers all three without a separate join table.
--
-- Access is via the service-role admin client in the Nexus API routes, so RLS is
-- enabled with no policy (deny by default; the service role bypasses RLS). Ownership
-- (student_id) and staff-read access are enforced in the API layer, matching the
-- nexus_study_folders/files/comments convention.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS nexus_study_file_annotations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       UUID NOT NULL REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_number   INT NOT NULL CHECK (page_number > 0),
  kind          TEXT NOT NULL CHECK (kind IN ('pen', 'highlighter', 'note')),
  color         TEXT NOT NULL DEFAULT '#FFD54F',
  stroke_width  NUMERIC,
  -- Array of {x,y} fractions (0..1), one entry per sampled point. NULL for 'note'.
  points        JSONB,
  -- Single anchor point (0..1). Used by 'note'; NULL for pen/highlighter.
  anchor_x      NUMERIC,
  anchor_y      NUMERIC,
  -- Required for 'note'; optional margin comment on a pen/highlighter stroke.
  note_text     TEXT,
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_study_annotation_shape CHECK (
    (kind = 'note' AND points IS NULL AND anchor_x IS NOT NULL AND anchor_y IS NOT NULL AND note_text IS NOT NULL) OR
    (kind IN ('pen', 'highlighter') AND points IS NOT NULL AND anchor_x IS NULL AND anchor_y IS NULL)
  )
);

-- The reader loads one file's annotations for one student at a time.
CREATE INDEX IF NOT EXISTS idx_nexus_study_annotations_owner
  ON nexus_study_file_annotations(file_id, student_id) WHERE is_deleted = false;

-- Teacher "Students" tab: per-student annotation counts across a file.
CREATE INDEX IF NOT EXISTS idx_nexus_study_annotations_file
  ON nexus_study_file_annotations(file_id) WHERE is_deleted = false;

ALTER TABLE nexus_study_file_annotations ENABLE ROW LEVEL SECURITY;
