-- ============================================================
-- Second bank (nexus_verified_questions) -> central bank (Phase 7)
-- ------------------------------------------------------------
-- Consolidates the classroom-scoped verified-question bank into the central
-- nexus_qb_questions, then re-points existing classroom test references to the
-- bank copy WHILE keeping question_id set (the dual-FK chk_test_question_ref
-- makes the take flow read either, so published classroom tests keep working).
--
-- Dedupe-aware: a verified question that already exists in the bank (>=0.9
-- normalized similarity) links to the existing row instead of inserting a copy,
-- clustering true duplicates via a shared repeat_group_id.
--
-- Additive + idempotent + reversible (bridge column + created_by preserved).
-- ============================================================

ALTER TABLE nexus_verified_questions
  ADD COLUMN IF NOT EXISTS qb_question_id UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL;

-- NOT unique: dedupe can collapse several verified questions onto one bank row.
DROP INDEX IF EXISTS idx_verified_qb_question_id;
CREATE INDEX IF NOT EXISTS idx_verified_qb_question_id
  ON nexus_verified_questions(qb_question_id) WHERE qb_question_id IS NOT NULL;

DO $$
DECLARE
  vq RECORD;
  v_qid UUID;
  v_match UUID;
  v_norm TEXT;
BEGIN
  FOR vq IN SELECT * FROM nexus_verified_questions WHERE qb_question_id IS NULL AND is_active = true LOOP
    v_norm := nexus_qb_normalize(vq.question_text);
    v_match := NULL;

    -- Dedupe: reuse an existing near-identical bank question if one exists.
    IF v_norm <> '' THEN
      SELECT id INTO v_match
      FROM nexus_qb_questions
      WHERE is_active = true
        AND question_text_norm % v_norm
        AND similarity(question_text_norm, v_norm) >= 0.9
      ORDER BY similarity(question_text_norm, v_norm) DESC
      LIMIT 1;
    END IF;

    IF v_match IS NOT NULL THEN
      v_qid := v_match;
    ELSE
      INSERT INTO nexus_qb_questions (
        question_text, question_image_url, question_format, options, correct_answer, explanation_brief,
        difficulty, exam_relevance, categories, status, origin, answer_source, is_active, created_by
      )
      VALUES (
        vq.question_text,
        vq.question_image_url,
        CASE
          WHEN vq.question_type = 'numerical' THEN 'NUMERICAL'
          WHEN vq.question_type = 'drawing'   THEN 'DRAWING_PROMPT'
          ELSE 'MCQ'
        END,
        vq.options,
        COALESCE(vq.correct_answer, ''),
        COALESCE(vq.explanation, 'Imported from a classroom question'),
        UPPER(COALESCE(vq.difficulty, 'medium')),
        'NATA',
        COALESCE(vq.tags, ARRAY[]::text[]),
        'active', 'authored', 'teacher_verified', true, vq.created_by
      )
      RETURNING id INTO v_qid;
    END IF;

    UPDATE nexus_verified_questions SET qb_question_id = v_qid WHERE id = vq.id;

    -- Re-point classroom test references to the bank copy (keep question_id for back-compat).
    UPDATE nexus_test_questions
    SET qb_question_id = v_qid
    WHERE question_id = vq.id AND qb_question_id IS NULL;
  END LOOP;
END $$;
