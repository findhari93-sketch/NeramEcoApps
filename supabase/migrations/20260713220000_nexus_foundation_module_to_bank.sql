-- ============================================================
-- Foundation + Module quiz silos -> Question Bank (Phase 6, backfill)
-- ------------------------------------------------------------
-- Same recipe as the study/recap backfills. Both silos share the inline
-- MCQ shape (option_a..d + correct_option). Drains each section's quiz into
-- the bank and rebuilds it as a composed, placed test:
--   nexus_foundation_quiz_questions   -> placement context_type='foundation_section'
--   nexus_module_item_quiz_questions  -> placement context_type='module_item'
-- (both single-test contexts, no sequential gating).
--
-- Additive + idempotent + reversible. Existing take/attempt flows are NOT
-- touched. Rollback: DELETE FROM nexus_tests WHERE created_from IN
-- ('foundation_migration','module_migration').
-- ============================================================

ALTER TABLE nexus_foundation_quiz_questions
  ADD COLUMN IF NOT EXISTS qb_question_id UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL;
ALTER TABLE nexus_module_item_quiz_questions
  ADD COLUMN IF NOT EXISTS qb_question_id UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_foundation_q_qb_question_id
  ON nexus_foundation_quiz_questions(qb_question_id) WHERE qb_question_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_module_q_qb_question_id
  ON nexus_module_item_quiz_questions(qb_question_id) WHERE qb_question_id IS NOT NULL;

-- Generic backfill for a (questions table, context_type) pair via dynamic SQL.
DO $$
DECLARE
  cfg RECORD;
  sec_id UUID;
  q RECORD;
  v_test_id UUID;
  v_qid UUID;
  v_count INT;
BEGIN
  FOR cfg IN
    SELECT * FROM (VALUES
      ('nexus_foundation_quiz_questions', 'foundation_section', 'foundation_migration'),
      ('nexus_module_item_quiz_questions', 'module_item', 'module_migration')
    ) AS c(qtable, ctype, cfrom)
  LOOP
    FOR sec_id IN EXECUTE format('SELECT DISTINCT section_id FROM %I', cfg.qtable) LOOP
      -- Idempotency: skip sections already placed.
      IF EXISTS (
        SELECT 1 FROM nexus_test_placements
        WHERE context_type = cfg.ctype::nexus_placement_context AND context_id = sec_id AND is_active = true
      ) THEN
        CONTINUE;
      END IF;

      EXECUTE format('SELECT count(*) FROM %I WHERE section_id = $1', cfg.qtable) INTO v_count USING sec_id;
      IF v_count = 0 THEN CONTINUE; END IF;

      INSERT INTO nexus_tests (title, test_type, total_marks, is_published, is_active, is_repository, created_from)
      VALUES ('Quiz', 'untimed', v_count, true, true, true, cfg.cfrom)
      RETURNING id INTO v_test_id;

      FOR q IN EXECUTE format(
        'SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, sort_order, qb_question_id FROM %I WHERE section_id = $1 ORDER BY sort_order',
        cfg.qtable
      ) USING sec_id
      LOOP
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
            COALESCE(q.explanation, 'Imported from a ' || replace(cfg.ctype, '_', ' ') || ' quiz'),
            'MEDIUM', 'NATA', ARRAY[]::text[], 'active', 'authored', 'teacher_verified', true
          )
          RETURNING id INTO v_qid;
          EXECUTE format('UPDATE %I SET qb_question_id = $1 WHERE id = $2', cfg.qtable) USING v_qid, q.id;
        ELSE
          v_qid := q.qb_question_id;
        END IF;

        INSERT INTO nexus_test_questions (test_id, qb_question_id, sort_order, marks, negative_marks)
        VALUES (v_test_id, v_qid, q.sort_order, 1, 0);
      END LOOP;

      INSERT INTO nexus_test_placements (test_id, context_type, context_id)
      VALUES (v_test_id, cfg.ctype::nexus_placement_context, sec_id);
    END LOOP;
  END LOOP;
END $$;
