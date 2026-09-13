-- Hold a drawing review, then hand it back deliberately.
--
-- WHY
-- Pressing Complete sent the student a Teams card in the same request: the
-- review, the notification, the points, all at once. That is fine one sheet at
-- a time and wrong for a class, because there is no moment where the teacher
-- can look at what is about to go out and decide.
--
-- ROLLING, NOT A PUBLISH EVENT. The exam flow publishes once and is done.
-- Drawings cannot work that way: late joiners keep submitting an assignment for
-- weeks after the class, so releasing means "hand back everything held right
-- now", repeatable forever, with no terminal published state and no closing
-- date. Handing back to one student is the same path with one row selected.

-- The batch ------------------------------------------------------------------
--
-- A batch is simply what was held at the moment the button was pressed. Two
-- batches for the same assignment a week apart is the normal case, not an edge.
--
-- notify_cursor exists because fifty-eight personalised Teams cards do not fit
-- one function budget. The release writes the records; a separate pass walks
-- the cursor and announces. A timeout while announcing must never cost the
-- teacher the release itself.
CREATE TABLE IF NOT EXISTS public.drawing_release_batch (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id    UUID REFERENCES public.nexus_class_assignments(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind             TEXT NOT NULL DEFAULT 'all'
                   CHECK (kind IN ('all', 'selection', 'single')),
  submission_count INTEGER NOT NULL DEFAULT 0,
  released_at      TIMESTAMPTZ,
  notified_count   INTEGER NOT NULL DEFAULT 0,
  notify_cursor    INTEGER NOT NULL DEFAULT 0,
  notify_error     TEXT
);

-- Service role only, like the six evaluation tables. The API routes are the
-- access boundary.
ALTER TABLE public.drawing_release_batch ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.drawing_release_batch IS
  'One hand-back. Rolling: an assignment can have many, as late joiners submit.';

-- Held or released -----------------------------------------------------------
--
-- No new state machine. `status = reviewed AND released_at IS NULL` is held;
-- `status = released` is out. Both labels are already in the existing CHECK.
-- drawing_submissions.status stays 'submitted' while a review is held and only
-- flips to completed/redo at release, so the student's own page needs no change
-- at all: it simply does not see a review that has not been handed back.
ALTER TABLE public.drawing_evaluation
  ADD COLUMN IF NOT EXISTS released_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS release_batch_id UUID REFERENCES public.drawing_release_batch(id) ON DELETE SET NULL,
  -- What the teacher decided, remembered while it waits: a held review still
  -- knows whether it is going out as a pass or as a redo.
  ADD COLUMN IF NOT EXISTS intent           TEXT CHECK (intent IN ('complete', 'redo')),
  -- Whether this review's corrections may be used to teach the model. Default
  -- yes; the confirm screen offers a per-review opt out.
  ADD COLUMN IF NOT EXISTS train_from_this  BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_drawing_evaluation_held
  ON public.drawing_evaluation (submission_id)
  WHERE released_at IS NULL;

-- One manual review row per submission, ever. The marks and rubric routes both
-- find-or-create it, and two of them racing would otherwise split a teacher's
-- work across two rows with no way to tell which was current.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drawing_evaluation_manual_one
  ON public.drawing_evaluation (submission_id)
  WHERE source = 'manual';

-- Opt in per assignment ------------------------------------------------------
--
-- THE MOST IMPORTANT LINE IN THIS FILE is the default.
--
-- Every assignment that exists today keeps sending on Complete exactly as it
-- does now, so no teacher's habit changes under them and no existing test has
-- to be edited. Holding is something a new drawing assignment opts into.
ALTER TABLE public.nexus_class_assignments
  ADD COLUMN IF NOT EXISTS review_release_mode TEXT NOT NULL DEFAULT 'immediate'
    CHECK (review_release_mode IN ('immediate', 'held'));

COMMENT ON COLUMN public.nexus_class_assignments.review_release_mode IS
  'immediate: Complete notifies the student at once, as it always has. held: reviews wait for a hand-back.';
