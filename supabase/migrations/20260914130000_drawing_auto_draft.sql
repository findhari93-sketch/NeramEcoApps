-- Draft every submitted drawing automatically, and turn sideways photos upright.
--
-- WHY
-- Drafting was a button a teacher pressed, and it could never be pressed: every
-- brief type is inactive, no anchor sheets exist, and 69 of the 84 sheets
-- waiting are assignment drawings with no brief type at all. The founder's
-- decision is to draft WITHOUT reference sheets on the criteria the rubric
-- panel already shows, for new sheets and the ones already waiting.
--
-- Automatic means two callers can reach the same sheet at once: the student's
-- phone fires a draft right after submitting, and the review queue sweeps
-- anything still waiting when a teacher opens it. So a run first CLAIMS the
-- sheet by inserting a 'running' row, and the unique index below makes the
-- second claim fail instead of paying Gemini twice for one drawing.
--
-- Idempotent: safe to run again.

-- Two new evaluation states --------------------------------------------------
--
-- running:    claimed by a draft in progress. Turns into draft or needs_manual,
--             or is deleted when the AI controls refused the call. A running
--             row older than ten minutes is treated as abandoned (a function
--             that timed out) and may be reclaimed.
-- superseded: a draft replaced by a newer one, either "Draft again" or a
--             student replacing their photo. Kept, not deleted, so the
--             history of what the model said is still there.
ALTER TABLE public.drawing_evaluation
  DROP CONSTRAINT IF EXISTS drawing_evaluation_status_check;

ALTER TABLE public.drawing_evaluation
  ADD CONSTRAINT drawing_evaluation_status_check
  CHECK (status IN ('draft', 'needs_manual', 'reviewed', 'released', 'running', 'superseded'));

-- At most one live AI draft per sheet ----------------------------------------
--
-- Live means running or draft. Reviewed, released, needs_manual and
-- superseded rows are history and may pile up. Safe to create on production:
-- no source = 'ai' rows exist there yet.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drawing_evaluation_ai_live
  ON public.drawing_evaluation (submission_id)
  WHERE source = 'ai' AND status IN ('running', 'draft');

-- Which way the server turned the photo ---------------------------------------
--
-- NULL means the photo was left as the student uploaded it. Otherwise the
-- clockwise turn applied before drafting, so the review screen can say the
-- sheet was turned and a wrong turn can be traced. Cleared when the student
-- replaces the photo.
ALTER TABLE public.drawing_submissions
  ADD COLUMN IF NOT EXISTS auto_rotated_deg SMALLINT
  CHECK (auto_rotated_deg IN (90, 180, 270));

COMMENT ON COLUMN public.drawing_submissions.auto_rotated_deg IS
  'Clockwise degrees the server turned original_image_url to make the drawing upright before AI drafting. NULL = not turned.';
