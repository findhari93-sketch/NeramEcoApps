-- ============================================================
-- Study Materials silo -> Question Bank (Phase 4, backfill)
-- ------------------------------------------------------------
-- Drains the trapped inline study-material test questions into the
-- central bank and rebuilds each study test as a composed, placed test:
--   nexus_study_test_questions -> nexus_qb_questions (bridge qb_question_id)
--   nexus_study_tests          -> nexus_tests (is_repository, created_from='study_migration')
--   file link                  -> nexus_test_placements (context_type='study_file')
--
-- Additive + idempotent + reversible:
--   * skips study tests that already have a study_file placement
--   * skips questions already bridged (qb_question_id set)
--   * rollback: DELETE FROM nexus_tests WHERE created_from='study_migration'
--     (cascades composed questions + placements). Backfilled bank questions
--     persist by design (they are the reusable asset), linked via the bridge.
--
-- The existing take/grade/completion flow (nexus_study_test_* + the
-- nexus_study_mark_completed RPC) is NOT touched here.
-- ============================================================

-- 1. Bridge column
ALTER TABLE nexus_study_test_questions
  ADD COLUMN IF NOT EXISTS qb_question_id UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_tq_qb_question_id
  ON nexus_study_test_questions(qb_question_id) WHERE qb_question_id IS NOT NULL;

-- 2. Backfill + compose + place
DO $$
DECLARE
  st RECORD;
  sq RECORD;
  v_test_id UUID;
  v_qid UUID;
BEGIN
  FOR st IN SELECT * FROM nexus_study_tests LOOP
    -- Idempotency: skip if this file already has a study_file placement.
    IF EXISTS (
      SELECT 1 FROM nexus_test_placements
      WHERE context_type = 'study_file' AND context_id = st.file_id AND is_active = true
    ) THEN
      CONTINUE;
    END IF;

    -- Composed test shell
    INSERT INTO nexus_tests (title, test_type, total_marks, is_published, is_active, is_repository, created_from, created_by)
    VALUES (
      COALESCE(st.title, 'Chapter test'),
      'untimed',
      (SELECT count(*) FROM nexus_study_test_questions q WHERE q.test_id = st.id),
      COALESCE(st.is_published, true),
      true, true, 'study_migration', st.created_by
    )
    RETURNING id INTO v_test_id;

    -- Backfill each question into the bank, then add to the composition.
    FOR sq IN SELECT * FROM nexus_study_test_questions WHERE test_id = st.id ORDER BY sort_order LOOP
      IF sq.qb_question_id IS NULL THEN
        INSERT INTO nexus_qb_questions (
          question_text, question_format, options, correct_answer, explanation_brief,
          difficulty, exam_relevance, categories, status, origin, answer_source, is_active, created_by
        )
        VALUES (
          sq.question_text,
          'MCQ',
          (SELECT jsonb_agg(jsonb_build_object('id', o.k, 'text', o.v) ORDER BY o.ord)
             FROM (VALUES ('a', sq.option_a, 1), ('b', sq.option_b, 2), ('c', sq.option_c, 3), ('d', sq.option_d, 4)) AS o(k, v, ord)
             WHERE o.v IS NOT NULL AND o.v <> ''),
          sq.correct_option,
          COALESCE(sq.explanation, 'Imported from a study-material test'),
          'MEDIUM', 'NATA', ARRAY[]::text[], 'active', 'authored', 'teacher_verified', true, st.created_by
        )
        RETURNING id INTO v_qid;
        UPDATE nexus_study_test_questions SET qb_question_id = v_qid WHERE id = sq.id;
      ELSE
        v_qid := sq.qb_question_id;
      END IF;

      INSERT INTO nexus_test_questions (test_id, qb_question_id, sort_order, marks, negative_marks)
      VALUES (v_test_id, v_qid, sq.sort_order, 1, 0);
    END LOOP;

    -- Place onto the study file.
    INSERT INTO nexus_test_placements (test_id, context_type, context_id, passing_pct, created_by)
    VALUES (v_test_id, 'study_file', st.file_id, st.passing_pct, st.created_by);
  END LOOP;
END $$;
