-- ============================================================
-- Study Materials cutover: one engine, one attempt table
-- ------------------------------------------------------------
-- Chapter tests were authored into nexus_study_tests and graded by their own
-- grader (gradeAndRecordAttempt), separate from the unified engine. Every
-- chapter test has ALSO been mirrored into the bank as a 'content_gate' test
-- placed at study_file since the earlier mirror work, so the cutover is mostly
-- a read switch rather than a data move.
--
-- This migration makes that assumption true rather than trusting it:
--   1. Repairs any study test whose mirror is missing or was torn down.
--   2. Copies historical study attempts into nexus_test_attempts so a student's
--      history stays continuous across the switch.
--
-- Idempotent: both steps skip work already done, so a re-run is a no-op.
-- Nothing is dropped. nexus_study_test* remain, unread by the new code paths,
-- for one release.
-- ============================================================

DO $$
DECLARE
  r_test RECORD;
  r_q RECORD;
  v_new_test UUID;
  v_qb UUID;
  v_options JSONB;
  v_repaired INT := 0;
  v_attempts INT := 0;
BEGIN
  -- ---------- 1. Repair missing mirrors ----------
  FOR r_test IN
    SELECT st.id, st.file_id, st.title, st.passing_pct, st.created_by
    FROM nexus_study_tests st
    WHERE NOT EXISTS (
      SELECT 1 FROM nexus_test_placements p
      WHERE p.context_type = 'study_file' AND p.context_id = st.file_id AND p.is_active
    )
  LOOP
    -- Skip an empty test: composing a paper with no questions would create a
    -- placement students can open and never pass.
    IF NOT EXISTS (SELECT 1 FROM nexus_study_test_questions WHERE test_id = r_test.id) THEN
      CONTINUE;
    END IF;

    INSERT INTO nexus_tests (
      classroom_id, title, description, test_type, total_marks, passing_marks,
      is_published, is_active, is_repository, test_kind, created_from,
      shuffle_questions, is_custom, created_by
    )
    VALUES (
      NULL,
      COALESCE(r_test.title, 'Chapter test'),
      NULL, 'untimed',
      (SELECT count(*) FROM nexus_study_test_questions WHERE test_id = r_test.id),
      GREATEST(1, ROUND(
        (COALESCE(r_test.passing_pct, 70)::numeric / 100)
        * (SELECT count(*) FROM nexus_study_test_questions WHERE test_id = r_test.id)
      )),
      true, true, false, 'content_gate', 'study_cutover_repair',
      false, false, r_test.created_by
    )
    RETURNING id INTO v_new_test;

    FOR r_q IN
      SELECT * FROM nexus_study_test_questions WHERE test_id = r_test.id ORDER BY sort_order, created_at
    LOOP
      v_qb := r_q.qb_question_id;

      -- No bridge means this question never reached the bank. Put it there now,
      -- in the bank's own option shape, so the unified grader can mark it.
      IF v_qb IS NULL OR NOT EXISTS (SELECT 1 FROM nexus_qb_questions WHERE id = v_qb) THEN
        -- Built as its own statement: a parenthesised VALUES list inside an
        -- INSERT ... VALUES is read as more target expressions, not a subquery.
        -- Blank options are dropped, so a three-option question stays three.
        SELECT jsonb_agg(elem ORDER BY ord)
        INTO v_options
        FROM (
          VALUES
            (1, jsonb_build_object('id', 'a', 'text', r_q.option_a)),
            (2, jsonb_build_object('id', 'b', 'text', r_q.option_b)),
            (3, jsonb_build_object('id', 'c', 'text', r_q.option_c)),
            (4, jsonb_build_object('id', 'd', 'text', r_q.option_d))
        ) AS t(ord, elem)
        WHERE elem->>'text' IS NOT NULL AND elem->>'text' <> '';

        INSERT INTO nexus_qb_questions (
          question_text, question_format, options, correct_answer,
          explanation_brief, difficulty, exam_relevance, categories,
          origin, status, is_active, created_by
        )
        VALUES (
          r_q.question_text, 'MCQ', v_options,
          r_q.correct_option, r_q.explanation, 'MEDIUM', 'BOTH', ARRAY[]::text[],
          'authored', 'active', true, r_test.created_by
        )
        RETURNING id INTO v_qb;

        UPDATE nexus_study_test_questions SET qb_question_id = v_qb WHERE id = r_q.id;
      END IF;

      INSERT INTO nexus_test_questions (test_id, qb_question_id, sort_order, marks, negative_marks)
      VALUES (v_new_test, v_qb, COALESCE(r_q.sort_order, 0), 1, 0);
    END LOOP;

    -- Revive-or-insert, because uq_placement_test_context has no predicate: a
    -- previously deactivated row still occupies (context_type, context_id,
    -- test_id) forever and a plain INSERT would raise 23505.
    INSERT INTO nexus_test_placements (test_id, context_type, context_id, passing_pct, is_visible, is_active, created_by)
    VALUES (v_new_test, 'study_file', r_test.file_id, COALESCE(r_test.passing_pct, 70), true, true, r_test.created_by)
    ON CONFLICT (context_type, context_id, test_id)
    DO UPDATE SET is_active = true, is_visible = true, passing_pct = EXCLUDED.passing_pct;

    v_repaired := v_repaired + 1;
  END LOOP;

  -- ---------- 2. Carry attempt history across ----------
  -- Matched through the ACTIVE study_file placement, which is the same route the
  -- new read path takes, so anything this cannot map is also something the new
  -- path would not have shown.
  INSERT INTO nexus_test_attempts (
    test_id, student_id, placement_id, attempt_number, status,
    answers, score, total_marks, percentage, started_at, submitted_at, created_at
  )
  SELECT
    p.test_id, sa.student_id, p.id,
    COALESCE(sa.attempt_number, 1), 'submitted',
    COALESCE(sa.answers, '{}'::jsonb),
    COALESCE(sa.correct_count, 0), COALESCE(sa.total_count, 0), COALESCE(sa.score_pct, 0),
    sa.created_at, sa.created_at, sa.created_at
  FROM nexus_study_test_attempts sa
  JOIN nexus_study_tests st ON st.id = sa.test_id
  JOIN nexus_test_placements p
    ON p.context_type = 'study_file' AND p.context_id = st.file_id AND p.is_active
  WHERE NOT EXISTS (
    -- Re-run guard. A copied attempt is identified by the triple it lands on.
    SELECT 1 FROM nexus_test_attempts a
    WHERE a.test_id = p.test_id
      AND a.student_id = sa.student_id
      AND a.attempt_number = COALESCE(sa.attempt_number, 1)
  );
  GET DIAGNOSTICS v_attempts = ROW_COUNT;

  RAISE NOTICE 'study cutover: % mirrors repaired, % attempts carried across', v_repaired, v_attempts;
END $$;
