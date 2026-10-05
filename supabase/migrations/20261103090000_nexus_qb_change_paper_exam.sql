-- Move a whole paper to another question bank, and rename it in the same step.
--
-- A B.Planning paper uploaded as "JEE Paper 2A (B.Arch)" could only be fixed
-- question by question (nexus_qb_move_questions), into a second paper. This
-- changes the paper itself: its exam, and optionally its year, session and
-- shift, the same four-part key nexus_qb_rename_paper corrects.
--
-- The paper keeps its id, so everything pointing at it stays: questions
-- (original_paper_id), contributors, the study-file link, test provenance.
-- Everything pointing at its questions stays too: attempts, reports, answer
-- keys, solutions, videos, study marks and test placements.
--
-- What changes, all in one transaction:
--   - The paper row's exam_type, year, session and shift.
--   - Every source row on the old key moves to the new one (student paper
--     cards, bulk publish and the JSON export join on it). A question that
--     already has a row on the new key loses the old one instead.
--   - Sections the new exam does not have are remapped through p_section_map,
--     for example {"drawing": "planning"} when a B.Arch paper becomes B.Planning.
--     Numbers are kept unless the new section already uses them.
--   - exam_relevance follows the exam ('BOTH' stays), and the exam tag
--     (jee, jee-2b, nata) is swapped where the question carried it.
--
-- Drawing prompts that would land outside a Drawing section are left behind on
-- a new paper with the old name, with their source rows untouched, so nothing
-- is lost and a B.Arch drawing never shows up in B.Planning.

CREATE OR REPLACE FUNCTION nexus_qb_change_paper_exam(
  p_paper_id uuid,
  p_exam_type text,
  p_year integer,
  p_session text,
  p_shift text,
  p_section_map jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_paper nexus_qb_original_papers%ROWTYPE;
  new_session text := NULLIF(btrim(p_session), '');
  new_shift text := NULLIF(btrim(p_shift), '');
  section_map jsonb := COALESCE(p_section_map, '{}'::jsonb);
  left_ids uuid[];
  total integer;
  remapped integer := 0;
  left_paper_id uuid;
  q record;
  target_section text;
  new_number integer;
  old_tag uuid;
  new_tag uuid;
  new_relevance text;
BEGIN
  SELECT * INTO old_paper FROM nexus_qb_original_papers WHERE id = p_paper_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paper not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_exam_type NOT IN ('JEE_PAPER_2', 'JEE_PAPER_2B', 'NATA') THEN
    RAISE EXCEPTION 'Pick JEE Paper 2A, JEE Paper 2B or NATA' USING ERRCODE = '22023';
  END IF;
  IF p_exam_type = old_paper.exam_type THEN
    RAISE EXCEPTION 'This paper is already in that question bank' USING ERRCODE = '22023';
  END IF;
  IF new_shift IS NOT NULL AND new_shift NOT IN ('forenoon', 'afternoon') THEN
    RAISE EXCEPTION 'Shift must be forenoon or afternoon' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(section_map) m
    WHERE m.value NOT IN ('math_mcq', 'math_numerical', 'aptitude', 'drawing', 'planning')
  ) THEN
    RAISE EXCEPTION 'Unknown section' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM nexus_qb_original_papers
    WHERE id <> p_paper_id
      AND exam_type = p_exam_type
      AND year = p_year
      AND COALESCE(session, '') = COALESCE(new_session, '')
      AND COALESCE(shift, '') = COALESCE(new_shift, '')
  ) THEN
    RAISE EXCEPTION 'Another paper is already saved as this exam, year, session and shift' USING ERRCODE = '23505';
  END IF;

  -- Drawing prompts with no Drawing section to go to: every one when the new
  -- exam is B.Planning, otherwise those whose section is remapped away.
  SELECT COALESCE(array_agg(id), '{}'), (SELECT count(*) FROM nexus_qb_questions WHERE original_paper_id = p_paper_id)
    INTO left_ids, total
  FROM nexus_qb_questions
  WHERE original_paper_id = p_paper_id
    AND question_format = 'DRAWING_PROMPT'
    AND (p_exam_type = 'JEE_PAPER_2B' OR (section_map ? section AND section_map ->> section <> 'drawing'));

  IF total > 0 AND COALESCE(array_length(left_ids, 1), 0) = total THEN
    RAISE EXCEPTION 'Every question on this paper is a drawing, which that question bank has no section for'
      USING ERRCODE = '22023';
  END IF;

  -- Sections the new exam lacks, renumbered on the old key's source rows
  -- before those rows move.
  FOR q IN
    SELECT id, section, display_order
    FROM nexus_qb_questions
    WHERE original_paper_id = p_paper_id
      AND NOT (id = ANY (left_ids))
      AND section IS NOT NULL
      AND section_map ? section
      AND section_map ->> section <> section
    ORDER BY section_order NULLS LAST, display_order NULLS LAST, id
  LOOP
    target_section := section_map ->> q.section;
    new_number := q.display_order;
    IF new_number IS NULL OR EXISTS (
      SELECT 1 FROM nexus_qb_questions
      WHERE original_paper_id = p_paper_id
        AND section = target_section
        AND display_order = new_number
    ) THEN
      SELECT COALESCE(MAX(display_order), 0) + 1 INTO new_number
      FROM nexus_qb_questions
      WHERE original_paper_id = p_paper_id AND section = target_section;
    END IF;

    UPDATE nexus_qb_questions
    SET section = target_section,
        section_order = CASE target_section
          WHEN 'math_mcq' THEN 1 WHEN 'math_numerical' THEN 2 WHEN 'aptitude' THEN 3
          WHEN 'drawing' THEN 4 ELSE 5 END,
        display_order = new_number
    WHERE id = q.id;

    UPDATE nexus_qb_question_sources
    SET question_number = new_number
    WHERE question_id = q.id
      AND exam_type = old_paper.exam_type
      AND year = old_paper.year
      AND COALESCE(session, '') = COALESCE(old_paper.session, '')
      AND COALESCE(shift, '') = COALESCE(old_paper.shift, '');

    remapped := remapped + 1;
  END LOOP;

  -- A question already listed on the new key (a repeat) keeps that row and
  -- drops the old one, so the unique index never fires.
  DELETE FROM nexus_qb_question_sources s
  WHERE s.exam_type = old_paper.exam_type
    AND s.year = old_paper.year
    AND COALESCE(s.session, '') = COALESCE(old_paper.session, '')
    AND COALESCE(s.shift, '') = COALESCE(old_paper.shift, '')
    AND NOT (s.question_id = ANY (left_ids))
    AND EXISTS (
      SELECT 1 FROM nexus_qb_question_sources t
      WHERE t.question_id = s.question_id
        AND t.exam_type = p_exam_type
        AND t.year = p_year
        AND COALESCE(t.session, '') = COALESCE(new_session, '')
        AND COALESCE(t.shift, '') = COALESCE(new_shift, '')
    );

  UPDATE nexus_qb_question_sources
  SET exam_type = p_exam_type, year = p_year, session = new_session, shift = new_shift
  WHERE exam_type = old_paper.exam_type
    AND year = old_paper.year
    AND COALESCE(session, '') = COALESCE(old_paper.session, '')
    AND COALESCE(shift, '') = COALESCE(old_paper.shift, '')
    AND NOT (question_id = ANY (left_ids));

  new_relevance := CASE WHEN p_exam_type = 'NATA' THEN 'NATA' ELSE 'JEE' END;
  UPDATE nexus_qb_questions
  SET exam_relevance = new_relevance
  WHERE original_paper_id = p_paper_id
    AND NOT (id = ANY (left_ids))
    AND exam_relevance <> 'BOTH'
    AND exam_relevance <> new_relevance;

  SELECT id INTO old_tag FROM nexus_qb_tags
  WHERE group_type = 'exam'
    AND slug = CASE old_paper.exam_type WHEN 'JEE_PAPER_2' THEN 'jee' WHEN 'JEE_PAPER_2B' THEN 'jee-2b' ELSE 'nata' END;
  SELECT id INTO new_tag FROM nexus_qb_tags
  WHERE group_type = 'exam'
    AND slug = CASE p_exam_type WHEN 'JEE_PAPER_2' THEN 'jee' WHEN 'JEE_PAPER_2B' THEN 'jee-2b' ELSE 'nata' END;
  IF old_tag IS NOT NULL AND new_tag IS NOT NULL AND old_tag <> new_tag THEN
    INSERT INTO nexus_qb_question_tags (question_id, tag_id)
    SELECT t.question_id, new_tag
    FROM nexus_qb_question_tags t
    JOIN nexus_qb_questions qq ON qq.id = t.question_id
    WHERE t.tag_id = old_tag
      AND qq.original_paper_id = p_paper_id
      AND NOT (qq.id = ANY (left_ids))
    ON CONFLICT (question_id, tag_id) DO NOTHING;

    DELETE FROM nexus_qb_question_tags t
    USING nexus_qb_questions qq
    WHERE qq.id = t.question_id
      AND t.tag_id = old_tag
      AND qq.original_paper_id = p_paper_id
      AND NOT (qq.id = ANY (left_ids));
  END IF;

  UPDATE nexus_qb_original_papers
  SET exam_type = p_exam_type, year = p_year, session = new_session, shift = new_shift
  WHERE id = p_paper_id;

  -- The drawings stay under the old name, on a paper of their own.
  IF COALESCE(array_length(left_ids, 1), 0) > 0 THEN
    INSERT INTO nexus_qb_original_papers (
      exam_type, year, session, shift, pdf_url, duration_minutes, uploaded_by,
      upload_status, paper_source, exam_date, is_student_visible
    )
    VALUES (
      old_paper.exam_type, old_paper.year, old_paper.session, old_paper.shift, old_paper.pdf_url,
      old_paper.duration_minutes, old_paper.uploaded_by, old_paper.upload_status,
      old_paper.paper_source, old_paper.exam_date, old_paper.is_student_visible
    )
    RETURNING id INTO left_paper_id;

    UPDATE nexus_qb_questions SET original_paper_id = left_paper_id WHERE id = ANY (left_ids);
  END IF;

  RETURN jsonb_build_object(
    'paper_id', p_paper_id,
    'left_paper_id', left_paper_id,
    'left_behind', COALESCE(array_length(left_ids, 1), 0),
    'remapped', remapped
  );
END;
$$;

-- Service role only. Supabase grants EXECUTE to anon and authenticated
-- directly, so REVOKE FROM PUBLIC alone would leave both able to call it.
REVOKE ALL ON FUNCTION nexus_qb_change_paper_exam(uuid, text, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_qb_change_paper_exam(uuid, text, integer, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
