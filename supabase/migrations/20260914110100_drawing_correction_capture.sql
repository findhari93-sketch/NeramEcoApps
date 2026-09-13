-- Why a teacher's score differs from the reference, and the rules that builds.
--
-- WHY
-- A score that disagrees with something (the AI's draft once there is one; for
-- now the student's previous score on the same criterion, or the class average)
-- is the most valuable moment in grading. It is where the teacher's standard
-- shows. Captured as one tap and an optional sentence, it becomes two things:
--
--  1. Training signal. With the reference band recorded beside the final band,
--     later analysis can tell an override from a first score, and whether the
--     teacher disagreed with a model, a previous grade or the class.
--  2. Band descriptions in the teacher's own words. "Why did you change this
--     from 4 to 2" answered in a sentence IS the description of a 2, filed under
--     its criterion and band. Phase 5's band editor is prefilled from these, so
--     writing 25 descriptions becomes promoting lines already written.
--
-- A rule is a sentence the teacher chose to keep ("a real error too small to
-- move a band stays in the band"). It is shown back while grading and can be
-- retired. Rules never change a score on their own: applying one to other
-- drafts means opening them, never a silent bulk write.
--
-- No snapshot table. The grading profile shows counts, not agreement
-- percentages (130 graded sheets give an error bar wider than any percentage),
-- and a count is one grouped query on a low-traffic staff page.

-- Correction capture on each criterion score --------------------------------
ALTER TABLE public.drawing_evaluation_criterion
  ADD COLUMN IF NOT EXISTS reference_band SMALLINT CHECK (reference_band BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS reference_kind TEXT
    CHECK (reference_kind IN ('ai', 'previous_attempt', 'student_last', 'class_average')),
  ADD COLUMN IF NOT EXISTS correction_reason_code TEXT
    CHECK (correction_reason_code IN ('work_changed', 'too_small', 'brief_weight', 'other')),
  ADD COLUMN IF NOT EXISTS correction_reason_text TEXT,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Rules ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drawing_grading_rule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- NULL means every brief / every criterion.
  brief_type_id   UUID REFERENCES public.drawing_brief_type(id) ON DELETE SET NULL,
  criterion_key   TEXT,
  reason_code     TEXT CHECK (reason_code IN ('work_changed', 'too_small', 'brief_weight', 'other')),
  text            TEXT NOT NULL CHECK (char_length(text) BETWEEN 3 AND 400),
  origin          TEXT NOT NULL DEFAULT 'teacher' CHECK (origin IN ('teacher', 'learned')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  applied_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_drawing_grading_rule_teacher_active
  ON public.drawing_grading_rule (teacher_id)
  WHERE is_active;

ALTER TABLE public.drawing_evaluation_criterion
  ADD COLUMN IF NOT EXISTS applied_rule_id UUID REFERENCES public.drawing_grading_rule(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drawing_eval_criterion_corrected
  ON public.drawing_evaluation_criterion (corrected_by, criterion_key)
  WHERE corrected_at IS NOT NULL;

-- Service role only, like the other evaluation tables.
ALTER TABLE public.drawing_grading_rule ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.drawing_evaluation_criterion.reference_band IS
  'The band the teacher disagreed with: ai_band, the previous attempt, the student''s last score, or the class average.';
COMMENT ON TABLE public.drawing_grading_rule IS
  'Sentences a teacher chose to keep about how they grade. Shown while grading; never applied to a score without a person opening it.';
