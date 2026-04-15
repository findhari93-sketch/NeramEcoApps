-- ============================================================
-- Drawing <-> Question Bank Bridge Migration
-- Links drawing_questions to nexus_qb_questions for unified
-- question management, repeat tracking, and solution sharing.
-- ============================================================

-- ============================================================
-- 1. Add bridge columns to drawing_questions
-- ============================================================
ALTER TABLE drawing_questions
  ADD COLUMN IF NOT EXISTS qb_question_id UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS question_number INTEGER;

-- Unique partial index: each drawing question links to at most one QB question
CREATE UNIQUE INDEX IF NOT EXISTS idx_dq_qb_question_id
  ON drawing_questions(qb_question_id) WHERE qb_question_id IS NOT NULL;

-- For fast lookups by year + question_number
CREATE INDEX IF NOT EXISTS idx_dq_year_qnum
  ON drawing_questions(year, question_number);

-- ============================================================
-- 2. Relax active_question_complete constraint for DRAWING_PROMPT
-- Drawing questions don't have a correct_answer; they are
-- reviewed by teachers, not auto-graded.
-- ============================================================
ALTER TABLE nexus_qb_questions DROP CONSTRAINT IF EXISTS active_question_complete;
ALTER TABLE nexus_qb_questions ADD CONSTRAINT active_question_complete
  CHECK (
    status != 'active'
    OR question_format = 'DRAWING_PROMPT'
    OR correct_answer IS NOT NULL
  );

-- ============================================================
-- 3. Sync existing drawing_questions into nexus_qb_questions
-- Creates a QB record for each drawing question, then links
-- them via qb_question_id.
-- ============================================================
DO $$
DECLARE
  dq RECORD;
  new_qb_id UUID;
  qnum INTEGER;
BEGIN
  -- Process each category group separately for sequential numbering
  FOR dq IN
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY year, category
        ORDER BY created_at
      ) AS rn
    FROM drawing_questions
    WHERE qb_question_id IS NULL
      AND is_active = true
    ORDER BY year DESC, category, created_at
  LOOP
    -- Insert into QB
    INSERT INTO nexus_qb_questions (
      question_text,
      question_format,
      difficulty,
      exam_relevance,
      categories,
      status,
      is_active,
      design_principle_tested,
      colour_constraint,
      objects_to_include,
      drawing_marks,
      created_at,
      updated_at
    ) VALUES (
      dq.question_text,
      'DRAWING_PROMPT',
      UPPER(dq.difficulty_tag),
      'NATA',
      ARRAY['drawing', dq.category],
      'active',
      true,
      dq.design_principle,
      dq.color_constraint,
      CASE
        WHEN array_length(dq.objects, 1) > 0 THEN
          (SELECT jsonb_agg(jsonb_build_object('name', obj))
           FROM unnest(dq.objects) AS obj)
        ELSE NULL
      END,
      NULL, -- drawing_marks not set on old questions
      dq.created_at,
      dq.updated_at
    )
    RETURNING id INTO new_qb_id;

    -- Compute overall question number across all categories for this year
    -- (will be overwritten below with per-year sequential numbering)

    -- Link drawing question to QB
    UPDATE drawing_questions
    SET qb_question_id = new_qb_id
    WHERE id = dq.id;

    -- Create question_sources entry for year tracking
    INSERT INTO nexus_qb_question_sources (
      question_id, exam_type, year, session, question_number
    ) VALUES (
      new_qb_id, 'NATA', dq.year, NULL, NULL -- question_number set in next step
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================
-- 4. Assign sequential question_number per year
-- Numbers are assigned per year, ordered by category then created_at.
-- This gives: 2D Q1-Q33, 3D Q34-Q65, Kit Q66-Q96 for year 2025.
-- ============================================================
WITH numbered AS (
  SELECT dq.id,
    ROW_NUMBER() OVER (
      PARTITION BY dq.year
      ORDER BY
        CASE dq.category
          WHEN '2d_composition' THEN 1
          WHEN '3d_composition' THEN 2
          WHEN 'kit_sculpture' THEN 3
          ELSE 4
        END,
        dq.created_at
    ) AS qnum
  FROM drawing_questions dq
  WHERE dq.is_active = true
)
UPDATE drawing_questions dq
SET question_number = n.qnum
FROM numbered n
WHERE dq.id = n.id;

-- Also set question_number on the QB sources
UPDATE nexus_qb_question_sources qs
SET question_number = dq.question_number
FROM drawing_questions dq
WHERE dq.qb_question_id = qs.question_id
  AND qs.exam_type = 'NATA'
  AND qs.year = dq.year
  AND dq.question_number IS NOT NULL;
