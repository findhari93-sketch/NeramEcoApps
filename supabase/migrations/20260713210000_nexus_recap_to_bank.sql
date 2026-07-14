-- ============================================================
-- Class Recap silo -> Question Bank (Phase 5, backfill)
-- ------------------------------------------------------------
-- Drains inline class-recap checkpoint questions into the central bank
-- and rebuilds each section's quiz as a composed, placed test:
--   nexus_class_recap_questions -> nexus_qb_questions (bridge qb_question_id)
--   per section quiz            -> nexus_tests (created_from='recap_migration')
--   section link                -> nexus_test_placements (context_type='class_recap_section',
--                                   context_id=section_id) carrying sort_order,
--                                   min_questions_to_pass, gating.sequential_unlock
--
-- Additive + idempotent + reversible. The existing sequential-unlock
-- take/gating flow (nexus_class_recap_* + assertUnlocked + progress) is
-- NOT touched; nexus_class_recap_progress stays the source of truth.
-- Rollback: DELETE FROM nexus_tests WHERE created_from='recap_migration'.
-- ============================================================

ALTER TABLE nexus_class_recap_questions
  ADD COLUMN IF NOT EXISTS qb_question_id UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recap_q_qb_question_id
  ON nexus_class_recap_questions(qb_question_id) WHERE qb_question_id IS NOT NULL;

DO $$
DECLARE
  sec RECORD;
  q RECORD;
  v_test_id UUID;
  v_qid UUID;
  v_count INT;
BEGIN
  FOR sec IN SELECT * FROM nexus_class_recap_sections LOOP
    -- Idempotency: skip sections that already have a placement.
    IF EXISTS (
      SELECT 1 FROM nexus_test_placements
      WHERE context_type = 'class_recap_section' AND context_id = sec.id AND is_active = true
    ) THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_count FROM nexus_class_recap_questions WHERE section_id = sec.id;
    IF v_count = 0 THEN
      CONTINUE;  -- nothing to compose
    END IF;

    INSERT INTO nexus_tests (title, test_type, total_marks, is_published, is_active, is_repository, created_from)
    VALUES (COALESCE(sec.title, 'Checkpoint'), 'untimed', v_count, true, true, true, 'recap_migration')
    RETURNING id INTO v_test_id;

    FOR q IN SELECT * FROM nexus_class_recap_questions WHERE section_id = sec.id ORDER BY sort_order LOOP
      IF q.qb_question_id IS NULL THEN
        INSERT INTO nexus_qb_questions (
          question_text, question_format, options, correct_answer, explanation_brief,
          difficulty, exam_relevance, categories, status, origin, answer_source, is_active
        )
        VALUES (
          q.question_text, 'MCQ',
          (SELECT jsonb_agg(jsonb_build_object('id', o.k, 'text', o.v) ORDER BY o.ord)
             FROM (VALUES ('a', q.option_a, 1), ('b', q.option_b, 2), ('c', q.option_c, 3), ('d', q.option_d, 4)) AS o(k, v, ord)
             WHERE o.v IS NOT NULL AND o.v <> ''),
          q.correct_option,
          COALESCE(q.explanation, 'Imported from a class-recap checkpoint'),
          'MEDIUM', 'NATA', ARRAY[]::text[], 'active', 'authored', 'teacher_verified', true
        )
        RETURNING id INTO v_qid;
        UPDATE nexus_class_recap_questions SET qb_question_id = v_qid WHERE id = q.id;
      ELSE
        v_qid := q.qb_question_id;
      END IF;

      INSERT INTO nexus_test_questions (test_id, qb_question_id, sort_order, marks, negative_marks)
      VALUES (v_test_id, v_qid, q.sort_order, 1, 0);
    END LOOP;

    INSERT INTO nexus_test_placements (test_id, context_type, context_id, min_questions_to_pass, sort_order, gating)
    VALUES (v_test_id, 'class_recap_section', sec.id, sec.min_questions_to_pass, COALESCE(sec.sort_order, 0), '{"sequential_unlock": true}'::jsonb);
  END LOOP;
END $$;
