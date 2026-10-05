-- Move questions that were filed in the wrong question bank to the right paper.
--
-- 2021 Session 1 (AN) has 25 B.Planning questions uploaded into the B.Arch
-- paper under Drawing. The only fix was a one-way, 2A-to-2B move made of five
-- separate PostgREST calls: a failure half way left a question on one paper
-- with its source row on another. This moves any selection from any paper to
-- any other (JEE Paper 2A, JEE Paper 2B or NATA) in one transaction.
--
-- What moves with each question:
--   - original_paper_id, section and section_order (the caller picks one
--     section for all of them, or NULL to keep each question's own).
--   - display_order: kept unless the target section already uses that number,
--     then appended after the section's last question. Numbers count per
--     section (Drawing runs 1 to 25), so the clash check is per section.
--   - exam_relevance: 'BOTH' stays, anything else follows the target exam.
--   - The source row on the source paper's key (exam_type, year, session,
--     shift) moves to the target paper's key, which is what student paper
--     cards, bulk publish and the JSON export join on. A question that already
--     has a row on the target key (a repeat) loses the old row instead, so the
--     unique index never fires.
--   - The source exam's tag (jee, jee-2b, nata) is swapped for the target's,
--     only where the question carried it.
--
-- Attempts, reports, study marks and test placements point at the question id
-- and carry no paper, so they follow without change.
--
-- Which sections a target exam allows is decided in TypeScript
-- (qbSectionsForExam). The one rule kept here as a guard: a drawing prompt can
-- only sit in a 'drawing' section, so a B.Arch drawing never lands in 2B.

CREATE OR REPLACE FUNCTION nexus_qb_move_questions(
  p_source_paper_id uuid,
  p_question_ids uuid[],
  p_target_paper_id uuid,
  p_section text,
  p_section_order smallint
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  src nexus_qb_original_papers%ROWTYPE;
  tgt nexus_qb_original_papers%ROWTYPE;
  wanted integer := COALESCE(array_length(p_question_ids, 1), 0);
  found_count integer;
  q record;
  target_section text;
  new_number integer;
  taken jsonb := '{}'::jsonb;
  src_tag uuid;
  tgt_tag uuid;
  tgt_relevance text;
BEGIN
  IF wanted = 0 THEN
    RAISE EXCEPTION 'Pick at least one question to move' USING ERRCODE = '22023';
  END IF;
  IF p_source_paper_id = p_target_paper_id THEN
    RAISE EXCEPTION 'These questions are already on that paper' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO src FROM nexus_qb_original_papers WHERE id = p_source_paper_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paper not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO tgt FROM nexus_qb_original_papers WHERE id = p_target_paper_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target paper not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO found_count
  FROM nexus_qb_questions
  WHERE id = ANY (p_question_ids) AND original_paper_id = p_source_paper_id;
  IF found_count <> wanted THEN
    RAISE EXCEPTION 'Some of these questions are not on this paper' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM nexus_qb_questions
    WHERE id = ANY (p_question_ids)
      AND question_format = 'DRAWING_PROMPT'
      AND COALESCE(p_section, section, '') <> 'drawing'
  ) THEN
    RAISE EXCEPTION 'Drawing questions can only move into a Drawing section. Untick them and try again.'
      USING ERRCODE = '22023';
  END IF;

  tgt_relevance := CASE WHEN tgt.exam_type = 'NATA' THEN 'NATA' ELSE 'JEE' END;

  SELECT id INTO src_tag FROM nexus_qb_tags
  WHERE group_type = 'exam'
    AND slug = CASE src.exam_type WHEN 'JEE_PAPER_2' THEN 'jee' WHEN 'JEE_PAPER_2B' THEN 'jee-2b' ELSE 'nata' END;
  SELECT id INTO tgt_tag FROM nexus_qb_tags
  WHERE group_type = 'exam'
    AND slug = CASE tgt.exam_type WHEN 'JEE_PAPER_2' THEN 'jee' WHEN 'JEE_PAPER_2B' THEN 'jee-2b' ELSE 'nata' END;

  FOR q IN
    SELECT id, section, section_order, display_order, exam_relevance
    FROM nexus_qb_questions
    WHERE id = ANY (p_question_ids)
    ORDER BY section_order NULLS LAST, display_order NULLS LAST, id
  LOOP
    target_section := COALESCE(p_section, q.section, '');

    -- Keep the number unless the target section (or an earlier question in
    -- this same move) already holds it.
    new_number := q.display_order;
    IF new_number IS NULL
       OR (taken -> target_section) @> to_jsonb(new_number)
       OR EXISTS (
         SELECT 1 FROM nexus_qb_questions
         WHERE original_paper_id = p_target_paper_id
           AND COALESCE(section, '') = target_section
           AND display_order = new_number
       ) THEN
      SELECT GREATEST(
               COALESCE(MAX(display_order), 0),
               COALESCE((SELECT MAX(v::int) FROM jsonb_array_elements_text(COALESCE(taken -> target_section, '[]'::jsonb)) v), 0)
             ) + 1
        INTO new_number
      FROM nexus_qb_questions
      WHERE original_paper_id = p_target_paper_id
        AND COALESCE(section, '') = target_section;
    END IF;
    taken := jsonb_set(
      taken,
      ARRAY[target_section],
      COALESCE(taken -> target_section, '[]'::jsonb) || to_jsonb(new_number)
    );

    UPDATE nexus_qb_questions
    SET original_paper_id = p_target_paper_id,
        section = CASE WHEN p_section IS NULL THEN section ELSE p_section END,
        section_order = CASE WHEN p_section IS NULL THEN section_order ELSE p_section_order END,
        display_order = new_number,
        exam_relevance = CASE WHEN exam_relevance = 'BOTH' THEN 'BOTH' ELSE tgt_relevance END
    WHERE id = q.id;

    IF EXISTS (
      SELECT 1 FROM nexus_qb_question_sources
      WHERE question_id = q.id
        AND exam_type = tgt.exam_type
        AND year = tgt.year
        AND COALESCE(session, '') = COALESCE(tgt.session, '')
        AND COALESCE(shift, '') = COALESCE(tgt.shift, '')
    ) THEN
      DELETE FROM nexus_qb_question_sources
      WHERE question_id = q.id
        AND exam_type = src.exam_type
        AND year = src.year
        AND COALESCE(session, '') = COALESCE(src.session, '')
        AND COALESCE(shift, '') = COALESCE(src.shift, '');
      UPDATE nexus_qb_question_sources
      SET question_number = new_number
      WHERE question_id = q.id
        AND exam_type = tgt.exam_type
        AND year = tgt.year
        AND COALESCE(session, '') = COALESCE(tgt.session, '')
        AND COALESCE(shift, '') = COALESCE(tgt.shift, '');
    ELSE
      UPDATE nexus_qb_question_sources
      SET exam_type = tgt.exam_type,
          year = tgt.year,
          session = tgt.session,
          shift = tgt.shift,
          question_number = new_number
      WHERE question_id = q.id
        AND exam_type = src.exam_type
        AND year = src.year
        AND COALESCE(session, '') = COALESCE(src.session, '')
        AND COALESCE(shift, '') = COALESCE(src.shift, '');
      IF NOT FOUND THEN
        INSERT INTO nexus_qb_question_sources (question_id, exam_type, year, session, shift, question_number)
        VALUES (q.id, tgt.exam_type, tgt.year, tgt.session, tgt.shift, new_number);
      END IF;
    END IF;

    IF src_tag IS NOT NULL AND tgt_tag IS NOT NULL AND src_tag <> tgt_tag
       AND EXISTS (SELECT 1 FROM nexus_qb_question_tags WHERE question_id = q.id AND tag_id = src_tag) THEN
      DELETE FROM nexus_qb_question_tags WHERE question_id = q.id AND tag_id = src_tag;
      INSERT INTO nexus_qb_question_tags (question_id, tag_id)
      VALUES (q.id, tgt_tag)
      ON CONFLICT (question_id, tag_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN wanted;
END;
$$;

-- Service role only. Supabase grants EXECUTE to anon and authenticated
-- directly, so REVOKE FROM PUBLIC alone would leave both able to call it.
REVOKE ALL ON FUNCTION nexus_qb_move_questions(uuid, uuid[], uuid, text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_qb_move_questions(uuid, uuid[], uuid, text, smallint) TO service_role;

-- The B.Arch exam tag reads like its B.Planning sibling.
UPDATE nexus_qb_tags SET label = 'JEE Paper 2A (B.Arch)'
WHERE group_type = 'exam' AND slug = 'jee' AND label = 'JEE Paper 2';

NOTIFY pgrst, 'reload schema';
