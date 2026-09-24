-- Correct a paper's year, session or shift after it was uploaded.
--
-- A paper chosen as "Session 1 (FN)" at bulk upload when it was really the
-- afternoon paper could not be fixed: the PATCH route only took pdf_url,
-- total_marks and duration_minutes, and the four-part key
-- (exam_type, year, session, shift) is copied onto every
-- nexus_qb_question_sources row. Student paper cards, bulk publish and the JSON
-- export all join on that copy (loadPaperQuestionIds, questionNumbersForPaper),
-- so changing the paper row alone would orphan every question on it.
--
-- One function, so the paper and its source rows move together or not at all.
-- Every source row carrying the old key is an appearance on THIS paper (the
-- key names the paper), including a question first uploaded on another one.
--
-- Both unique indexes still guard it: another paper already holding the new
-- key is refused up front with a readable message (23505), and a source row
-- that would collide raises 23505 from the index and rolls the whole change back.

CREATE OR REPLACE FUNCTION nexus_qb_rename_paper(
  p_paper_id uuid,
  p_year integer,
  p_session text,
  p_shift text
)
RETURNS SETOF nexus_qb_original_papers
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_paper nexus_qb_original_papers%ROWTYPE;
  new_session text := NULLIF(btrim(p_session), '');
  new_shift text := NULLIF(btrim(p_shift), '');
BEGIN
  SELECT * INTO old_paper FROM nexus_qb_original_papers WHERE id = p_paper_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paper not found' USING ERRCODE = 'P0002';
  END IF;

  IF new_shift IS NOT NULL AND new_shift NOT IN ('forenoon', 'afternoon') THEN
    RAISE EXCEPTION 'Shift must be forenoon or afternoon' USING ERRCODE = '22023';
  END IF;

  IF old_paper.year = p_year
     AND COALESCE(old_paper.session, '') = COALESCE(new_session, '')
     AND COALESCE(old_paper.shift, '') = COALESCE(new_shift, '') THEN
    RETURN QUERY SELECT * FROM nexus_qb_original_papers WHERE id = p_paper_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM nexus_qb_original_papers
    WHERE id <> p_paper_id
      AND exam_type = old_paper.exam_type
      AND year = p_year
      AND COALESCE(session, '') = COALESCE(new_session, '')
      AND COALESCE(shift, '') = COALESCE(new_shift, '')
  ) THEN
    RAISE EXCEPTION 'Another paper is already saved as this year, session and shift' USING ERRCODE = '23505';
  END IF;

  UPDATE nexus_qb_question_sources
  SET year = p_year, session = new_session, shift = new_shift
  WHERE exam_type = old_paper.exam_type
    AND year = old_paper.year
    AND COALESCE(session, '') = COALESCE(old_paper.session, '')
    AND COALESCE(shift, '') = COALESCE(old_paper.shift, '');

  RETURN QUERY
  UPDATE nexus_qb_original_papers
  SET year = p_year, session = new_session, shift = new_shift
  WHERE id = p_paper_id
  RETURNING *;
END;
$$;

-- Service role only. Supabase grants EXECUTE to anon and authenticated
-- directly, so REVOKE FROM PUBLIC alone would leave both able to call it.
REVOKE ALL ON FUNCTION nexus_qb_rename_paper(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_qb_rename_paper(uuid, integer, text, text) TO service_role;
