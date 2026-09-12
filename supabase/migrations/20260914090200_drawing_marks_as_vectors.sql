-- Teacher marks become vectors, on the same table the AI's marks already use.
--
-- WHY
-- The correction canvas existed only as pixels: strokes and labels were
-- flattened into a PNG on save and the shapes were thrown away. That cost two
-- things.
--
-- A bug: SketchOverCanvas always opened on original_image_url with an empty item
-- list, so a teacher who reopened it to add one more mark started from a blank
-- overlay, and the next save overwrote everything they had drawn before.
--
-- And the learning loop: a flattened PNG has no coordinates, so a teacher's
-- corrections are invisible to anything meant to learn from them.
-- drawing_annotation already records AI marks with source 'ai' and an action of
-- created / moved / deleted / kept. Putting the teacher's marks on the same
-- table is what turns "the teacher rubbed that one out" into a fact.
--
-- WHAT
-- Two columns. No backfill: see the note at the bottom.

-- A review record, not only the AI's record ------------------------------------
--
-- drawing_evaluation was designed as the row a model run produces. It is now the
-- row ONE REVIEW produces, whether or not a model prefilled it. That reframe is
-- what lets a teacher's marks hang off it while the AI is still switched off.
--
-- Defaulting to 'ai' keeps every existing row meaning exactly what it meant.
ALTER TABLE public.drawing_evaluation
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai', 'manual'));

COMMENT ON COLUMN public.drawing_evaluation.source IS
  'Who authored this review: a model run (ai) or a teacher working the canvas (manual).';

-- Finding a submission's manual review has to be cheap: the review screen asks
-- for it on every open.
CREATE INDEX IF NOT EXISTS idx_drawing_evaluation_manual
  ON public.drawing_evaluation (submission_id)
  WHERE source = 'manual';

-- The per-kind extras of a mark -------------------------------------------------
--
-- geometry already carries the shape, normalised 0 to 1 with the origin
-- top-left: region [x,y,w,h], point [x,y], stroke [[x,y],...]. What it cannot
-- carry is how the mark was drawn.
--
-- One JSONB column rather than five scalar ones, using the same short names the
-- sketch timeline already uses so the two formats read alike:
--
--   stroke      { w: fraction of image WIDTH, pressures: [0..1], highlight: bool }
--   point/text  { fs: fraction of image HEIGHT, leader: [x, y] }
--   any         { color: the exact hex drawn with }
--
-- fs is measured against the height and w against the width on purpose: that is
-- the existing contract in sketch-timeline.ts, and a comment that is a fraction
-- of the drawing keeps its apparent size on a phone, a laptop and a pen display.
ALTER TABLE public.drawing_annotation
  ADD COLUMN IF NOT EXISTS style JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.drawing_annotation.style IS
  'How the mark was drawn. stroke: w (fraction of width), pressures, highlight. point: fs (fraction of height), leader. Always: color.';

-- Deliberately NO backfill -----------------------------------------------------
--
-- drawing_submissions.ai_overlay_annotations was going to be migrated into this
-- table. It holds nothing worth moving:
--
--   prod     3 rows, ALL in the dead legacy {area,label,severity} shape,
--            0 in the RegionAnnotation {x,y,width,height,comment} shape
--   staging  0 rows
--
-- The read path already ignores the legacy shape (it tests `saved[0]?.x`), so
-- those three rows are inert and are left exactly where they are rather than
-- being guessed into a shape they were never in.
--
-- The 170 submissions carrying a reviewed_image_url keep it. Those overlays were
-- flattened before marks were vectors and cannot be recovered; the image stays
-- correct, it simply has no shapes behind it. Marks made from here on do.
