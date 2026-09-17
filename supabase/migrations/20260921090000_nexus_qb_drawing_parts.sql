-- Drawing questions with parts: "1(a) ... 1(b) ..." and "Draw X OR draw Y".
--
-- JEE Paper 2 prints several tasks under one question number. 2014 Q81 is
-- 1(a) and 1(b), both compulsory at 20 marks each; 2014 Q82 and every paper
-- from 2019 to 2026 put an OR inside one question ("attempt any one"). Until
-- now the whole blob sat in question_text with one solution image, so a
-- teacher could not give each part its own solution.
--
-- The parts live on the question row, the way MCQ options do, so the
-- question keeps its number, its paper count, its section range, its test row
-- and its marks. Scoring is untouched: a student still uploads one photo for
-- the question and it is marked as one question.
--
-- question_text stays the full printed question. The app rebuilds it from
-- these parts on every save (apps/nexus/src/lib/drawing-parts.ts), so the
-- search vectors, drawing mirrors and every screen that does not read this
-- column keep showing the whole question. That is why the search trigger
-- needs no change here.
--
-- The whole-question choice_group_id link (20260830090300) is left in place;
-- nothing uses it and the paper editor no longer offers it.

ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS drawing_parts JSONB;

ALTER TABLE nexus_qb_questions
  DROP CONSTRAINT IF EXISTS nexus_qb_questions_drawing_parts_shape;

ALTER TABLE nexus_qb_questions
  ADD CONSTRAINT nexus_qb_questions_drawing_parts_shape CHECK (
    drawing_parts IS NULL
    OR (
      question_format = 'DRAWING_PROMPT'
      AND jsonb_typeof(drawing_parts) = 'object'
      AND drawing_parts->>'mode' IN ('all', 'any_one')
      AND jsonb_typeof(drawing_parts->'items') = 'array'
      AND jsonb_array_length(drawing_parts->'items') BETWEEN 2 AND 4
    )
  );

COMMENT ON COLUMN nexus_qb_questions.drawing_parts IS
  'Parts of one DRAWING_PROMPT question: {mode: all|any_one, stem, stem_hi, items: [{id, label, text, text_hi, marks, solution_image_url, solution_video_url}]}. NULL for a single-task question. question_text is rebuilt from this on save by the app. Display and authoring only: scoring still treats the question as one unit.';
