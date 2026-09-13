-- How good the photo of a drawing is, measured once.
--
-- WHY
-- A teacher only discovers that a sheet is blank, or photographed too dark or
-- too soft to judge line weight, after opening it. Triage sorts those out
-- before anyone opens anything, and it needs the numbers stored rather than
-- re-measured from a multi-megabyte photo on every roster load.
--
-- Measured in the browser (lib/image-quality.ts): on the student's phone at
-- upload, where the pixels are already local, and by the teacher's browser for
-- anything uploaded before this existed. The server only validates and stores.
--
-- Shape, versioned so a changed measurement never mixes with old numbers:
--   { "sharpness": 246.8, "ink": 0.0654, "brightness": 157.6, "aspect": 0.753, "v": 1 }
--
-- NULL means "not measured yet", which triage treats as not yet cleared, never
-- as a pass.

ALTER TABLE public.drawing_submissions
  ADD COLUMN IF NOT EXISTS image_quality JSONB;

COMMENT ON COLUMN public.drawing_submissions.image_quality IS
  'Photo quality measured client side: sharpness (Laplacian variance), ink (0..1), brightness (0..255), aspect, v. NULL = not measured.';
