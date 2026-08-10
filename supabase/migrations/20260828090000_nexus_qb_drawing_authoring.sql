-- Authoring a drawing question, and gating its answer behind an attempt.
--
-- Two columns and one table, all additive. Every existing reader ignores them.
--
-- WHY drawing_focus_points IS ITS OWN COLUMN rather than a reuse:
--
--   objects_to_include is already mapped into drawing_questions.objects by
--   createDrawingQuestionFromQB and rendered as a chip row of nouns. Putting
--   "watch your horizon line" in there would send it to the practice module as
--   a thing to draw.
--
--   explanation_brief / explanation_detailed are the post-answer prose and are
--   rendered by the shared solution tab, which is not gated. Focus points are
--   revealed only after the student uploads, so reusing those fields would leak
--   gated content through every generic solution renderer in the app.
--
--   drawing_checklist_items is a global 60-row skills master keyed on category,
--   with per-student progress. It is a syllabus, not a per-question field.

ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS drawing_focus_points        JSONB,
  ADD COLUMN IF NOT EXISTS drawing_reference_image_url TEXT;

COMMENT ON COLUMN nexus_qb_questions.drawing_focus_points IS
  'Ordered [{text, weight?}] a student should concentrate on. Revealed only after they upload an attempt, or when they take the "show me the solution" route. Null for non-drawing questions.';

COMMENT ON COLUMN nexus_qb_questions.drawing_reference_image_url IS
  'A teacher-added aid for the prompt: a photo of the kit, a colour swatch. Distinct from question_image_url, which is the figure printed on the paper, and from solution_image_url, which is the worked answer and is gated.';

-- A student who chose to see the solution without attempting it first.
--
-- This cannot live on drawing_submissions, because the whole point of the row
-- is that there is no submission. It is deliberately not a column on
-- nexus_qb_study_marks either: that table is the bookmark toggle and is read by
-- the "studied" filter, which would then count reveals as study.
CREATE TABLE IF NOT EXISTS nexus_qb_drawing_reveals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES users(id)               ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES nexus_qb_questions(id)  ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, question_id)
);

COMMENT ON TABLE nexus_qb_drawing_reveals IS
  'One row per student per drawing question they unlocked without attempting first. Read by the practice panel to keep the solution open and to flag the later attempt for the teacher.';

CREATE INDEX IF NOT EXISTS idx_qb_drawing_reveals_student
  ON nexus_qb_drawing_reveals(student_id);

ALTER TABLE nexus_qb_drawing_reveals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_qb_drawing_reveals" ON nexus_qb_drawing_reveals;
CREATE POLICY "service_role_qb_drawing_reveals" ON nexus_qb_drawing_reveals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
