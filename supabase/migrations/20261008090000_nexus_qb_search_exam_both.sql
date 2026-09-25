-- nexus_qb_search: an exam filter includes questions marked for both exams.
--
-- Same signature and body as 20260903090200_nexus_qb_search_rpc.sql except the
-- exam_relevance predicate, so CREATE OR REPLACE keeps the existing grants.
-- The browse path (getQBQuestions / getTeacherQBQuestions) got the same rule in
-- packages/database, so search and browse agree on what "NATA" means.

CREATE OR REPLACE FUNCTION nexus_qb_search(
  p_query            text,
  p_role             text    DEFAULT 'student',
  p_restrict_ids     uuid[]  DEFAULT NULL,
  p_exclude_ids      uuid[]  DEFAULT NULL,
  p_statuses         text[]  DEFAULT NULL,
  p_only_active      boolean DEFAULT false,
  p_exam_relevance   text    DEFAULT NULL,
  p_categories       text[]  DEFAULT NULL,
  p_difficulty       text[]  DEFAULT NULL,
  p_question_format  text[]  DEFAULT NULL,
  p_origin           text[]  DEFAULT NULL,
  p_confidence_tier  text[]  DEFAULT NULL,
  p_solution_filter  text    DEFAULT NULL,
  p_limit            int     DEFAULT 20,
  p_offset           int     DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  rank         real,
  match_kind   text,
  did_you_mean text,
  total_count  bigint
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_col     text;
  v_norm    text := nexus_qb_search_normalize(p_query);
  v_tsq     tsquery;
  v_where   text;
  v_sql     text;
  v_hits    bigint := 0;
  v_suggest text;
BEGIN
  IF v_norm = '' THEN
    RETURN;
  END IF;

  v_col := CASE WHEN p_role = 'teacher' THEN 'search_vector_full'
                ELSE 'search_vector_public' END;

  -- Shared filter predicate. Every parameter is passed by position through
  -- USING, so nothing here is string interpolated.
  v_where := $w$
      ($2 IS NULL OR q.id = ANY($2))
  AND ($3 IS NULL OR q.status::text = ANY($3))
  AND ($4 = false OR (q.is_active = true AND q.status::text = 'active'))
  -- A JEE or NATA filter also returns questions set for both exams. Matching
  -- exactly hid all 177 "BOTH" questions from either exam's filter.
  AND ($5 IS NULL OR q.exam_relevance::text = $5
       OR ($5 IN ('JEE', 'NATA') AND q.exam_relevance::text = 'BOTH'))
  AND ($6 IS NULL OR q.categories && $6)
  AND ($7 IS NULL OR q.difficulty::text = ANY($7))
  AND ($8 IS NULL OR q.question_format::text = ANY($8))
  AND ($9 IS NULL OR q.origin::text = ANY($9))
  AND ($10 IS NULL OR q.confidence_tier::text = ANY($10))
  AND ($12 IS NULL OR NOT (q.id = ANY($12)))
  AND ($11 IS NULL OR CASE $11
        WHEN 'has_video'       THEN q.solution_video_url IS NOT NULL
        WHEN 'has_image'       THEN q.solution_image_url IS NOT NULL
        WHEN 'has_explanation' THEN q.explanation_brief  IS NOT NULL
        WHEN 'no_solution'     THEN q.solution_video_url IS NULL
                                AND q.solution_image_url IS NULL
                                AND q.explanation_brief  IS NULL
        ELSE true END)
  $w$;

  -- ---- Pass 1: every term must appear -----------------------------------
  v_tsq := nexus_qb_build_tsquery(p_query, true);
  IF v_tsq IS NOT NULL THEN
    v_sql := format($s$
      SELECT q.id,
             ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], q.%I, $1)::real AS rank,
             'text'::text,
             NULL::text,
             count(*) OVER () AS total_count
      FROM nexus_qb_questions q
      WHERE %s AND q.%I @@ $1
      ORDER BY rank DESC, q.created_at DESC
      LIMIT $13 OFFSET $14
    $s$, v_col, v_where, v_col);

    RETURN QUERY EXECUTE v_sql USING
      v_tsq, p_restrict_ids, p_statuses, p_only_active, p_exam_relevance,
      p_categories, p_difficulty, p_question_format, p_origin,
      p_confidence_tier, p_solution_filter, p_exclude_ids, p_limit, p_offset;

    GET DIAGNOSTICS v_hits = ROW_COUNT;
    IF v_hits > 0 OR p_offset > 0 THEN
      RETURN;
    END IF;
  END IF;

  -- ---- Pass 2: any term may appear --------------------------------------
  -- "kinematics parabola" finds nothing with AND, but the student almost
  -- certainly still wants the parabola questions.
  v_tsq := nexus_qb_build_tsquery(p_query, false);
  IF v_tsq IS NOT NULL THEN
    v_sql := format($s$
      SELECT q.id,
             ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], q.%I, $1)::real AS rank,
             'partial'::text,
             NULL::text,
             count(*) OVER () AS total_count
      FROM nexus_qb_questions q
      WHERE %s AND q.%I @@ $1
      ORDER BY rank DESC, q.created_at DESC
      LIMIT $13 OFFSET $14
    $s$, v_col, v_where, v_col);

    RETURN QUERY EXECUTE v_sql USING
      v_tsq, p_restrict_ids, p_statuses, p_only_active, p_exam_relevance,
      p_categories, p_difficulty, p_question_format, p_origin,
      p_confidence_tier, p_solution_filter, p_exclude_ids, p_limit, p_offset;

    GET DIAGNOSTICS v_hits = ROW_COUNT;
    IF v_hits > 0 THEN
      RETURN;
    END IF;
  END IF;

  -- ---- Pass 3: typo tolerant ---------------------------------------------
  -- word_similarity, not similarity: plain similarity compares the query
  -- against the WHOLE document, so one misspelled word against a long
  -- question scores near zero. word_similarity scores it against the best
  -- matching extent inside the document.
  -- Always reads search_doc_norm, which excludes explanations, so this path
  -- cannot leak solution text to a student regardless of role.
  -- Only guess at a correction for a query that contains a real word.
  -- Without this, "the of a" (every token a stopword, so both tsqueries came
  -- back NULL) fell straight through to trigram matching and returned 20
  -- arbitrary rows as though they were results. A query with nothing
  -- correctable in it should return nothing.
  IF v_norm !~ '(^| )[a-z0-9]{4,}( |$)' THEN
    RETURN;
  END IF;

  v_suggest := nexus_qb_did_you_mean(p_query);

  v_sql := format($s$
    SELECT q.id,
           word_similarity($1, q.search_doc_norm)::real AS rank,
           'fuzzy'::text,
           $15::text,
           count(*) OVER () AS total_count
    FROM nexus_qb_questions q
    WHERE %s
      AND word_similarity($1, q.search_doc_norm) >= 0.45
    ORDER BY rank DESC, q.created_at DESC
    LIMIT $13 OFFSET $14
  $s$, v_where);

  RETURN QUERY EXECUTE v_sql USING
    v_norm, p_restrict_ids, p_statuses, p_only_active, p_exam_relevance,
    p_categories, p_difficulty, p_question_format, p_origin,
    p_confidence_tier, p_solution_filter, p_exclude_ids, p_limit, p_offset, v_suggest;
END;
$fn$;

