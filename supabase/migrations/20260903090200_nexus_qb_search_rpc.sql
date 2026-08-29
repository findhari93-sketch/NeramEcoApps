-- ============================================================
-- Question Bank search: query understanding + ranked search RPC
-- ============================================================
-- The reported bug: searching "lines parabo" returned nothing, although a
-- question reads "...be two normal lines to the parabola $y^2=2x$...".
--
-- ILIKE '%lines parabo%' needs that exact substring, in that exact order,
-- with nothing between the words. Measured on production:
--
--   ILIKE '%lines parabo%'                       0 rows
--   websearch_to_tsquery('lines parabo')         0 rows   <- still 0
--   to_tsquery('lines:* & parabo:*')            11 rows
--
-- The middle line is the interesting one. Plain full text search does not fix
-- this on its own, because "parabo" is not a word. Students type prefixes, so
-- every token is matched as a prefix. That is the difference between 0 and 11.

-- ------------------------------------------------------------
-- 1. Synonym expansion from the curated tag registry
-- ------------------------------------------------------------
-- 94 active tags, 43 with hand written alias lists. That is the closest thing
-- the product has to a domain thesaurus, and it is already maintained by
-- teachers. Same approach as library_expand_query.

CREATE OR REPLACE FUNCTION nexus_qb_expand_query(p_query text)
RETURNS text[]
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(array_agg(DISTINCT t.label), '{}')
  FROM nexus_qb_tags t
  WHERE t.is_active = true
    AND nexus_qb_search_normalize(p_query) <> ''
    AND (
      nexus_qb_search_normalize(t.label) = nexus_qb_search_normalize(p_query)
      OR t.slug = replace(nexus_qb_search_normalize(p_query), ' ', '_')
      OR EXISTS (
        SELECT 1 FROM unnest(t.aliases) a
        WHERE length(nexus_qb_search_normalize(a)) >= 4
          AND nexus_qb_search_normalize(p_query)
              LIKE '%' || nexus_qb_search_normalize(a) || '%'
      )
      OR (length(nexus_qb_search_normalize(t.label)) >= 4
          AND nexus_qb_search_normalize(p_query)
              LIKE '%' || nexus_qb_search_normalize(t.label) || '%')
    )
$fn$;


-- ------------------------------------------------------------
-- 2. Turn what a student typed into a tsquery
-- ------------------------------------------------------------
-- p_conjunctive = true  -> every term must appear (the precise pass)
-- p_conjunctive = false -> any term may appear (the relaxed pass)
--
-- Injection is structurally impossible here: nexus_qb_search_normalize emits
-- only [a-z0-9 ], so no token can carry a tsquery operator. That is why this
-- can build the query by concatenation and still be safe.

CREATE OR REPLACE FUNCTION nexus_qb_build_tsquery(
  p_query       text,
  p_conjunctive boolean DEFAULT true
)
RETURNS tsquery
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_norm   text := nexus_qb_search_normalize(p_query);
  v_tokens text[];
  v_kept   text[] := '{}';
  v_tok    text;
  v_joined text;
  v_op     text := CASE WHEN p_conjunctive THEN ' & ' ELSE ' | ' END;
  v_tsq    tsquery;
  v_label  text;
BEGIN
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;

  v_tokens := regexp_split_to_array(v_norm, ' ');

  FOREACH v_tok IN ARRAY v_tokens LOOP
    CONTINUE WHEN v_tok = '';
    -- Drop English stopwords. Without this, "area of the parabola" builds
    -- "area:* & of:* & the:* & parabola:*", and because the english half of
    -- the vector strips stopwords, the & makes the whole query unsatisfiable.
    CONTINUE WHEN length(v_tok) < 2 AND v_tok !~ '^[0-9]$';
    CONTINUE WHEN to_tsvector('english', v_tok) = ''::tsvector AND length(v_tok) <= 3;
    v_kept := v_kept || (v_tok || ':*');
  END LOOP;

  IF array_length(v_kept, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  v_joined := array_to_string(v_kept, v_op);

  -- Both configs, matching how the vector was built: 'simple' preserves the
  -- glued math forms ("y2", "3d") verbatim, 'english' supplies stemming so
  -- "parabolas" finds "parabola".
  v_tsq := to_tsquery('simple', v_joined) || to_tsquery('english', v_joined);

  -- Canonical tag labels the query implies, OR'd in so a question tagged
  -- Perspective is reachable by an alias its text never contains.
  FOREACH v_label IN ARRAY nexus_qb_expand_query(p_query) LOOP
    v_tsq := v_tsq || phraseto_tsquery('simple', nexus_qb_search_normalize(v_label));
  END LOOP;

  RETURN v_tsq;
END;
$fn$;


-- ------------------------------------------------------------
-- 3. Best correction for a misspelled query
-- ------------------------------------------------------------
-- Only ever called on the fuzzy path, which itself only runs when both
-- indexed passes returned nothing. The `%` operator narrows candidates on the
-- trigram GIN index first, so the unnest never runs over the whole table.

CREATE OR REPLACE FUNCTION nexus_qb_did_you_mean(p_query text)
RETURNS text
LANGUAGE sql
STABLE
AS $fn$
  WITH norm AS (SELECT nexus_qb_search_normalize(p_query) AS q),
  -- Candidate recall must use word_similarity, NOT the `%` operator.
  -- `%` scores the query against the WHOLE document, so one short word against
  -- a long question scores near zero and matches nothing: measured on staging,
  -- "triangel" recalled 0 candidate rows that way even though the corpus is
  -- full of "triangle" (similarity 0.5). word_similarity scores against the
  -- best matching extent inside the document instead, and mirroring the
  -- threshold the fuzzy pass itself uses keeps the suggestion consistent with
  -- the rows actually shown.
  cand AS (
    SELECT w.search_doc_norm
    FROM nexus_qb_questions w, norm
    WHERE norm.q <> ''
      AND word_similarity(norm.q, w.search_doc_norm) >= 0.45
    LIMIT 200
  ),
  vocab AS (
    SELECT DISTINCT unnest(string_to_array(c.search_doc_norm, ' ')) AS word FROM cand c
  )
  SELECT v.word
  FROM vocab v, norm
  WHERE length(v.word) >= 4
    AND similarity(v.word, norm.q) >= 0.4
  ORDER BY similarity(v.word, norm.q) DESC, length(v.word)
  LIMIT 1
$fn$;


-- ------------------------------------------------------------
-- 4. The search RPC
-- ------------------------------------------------------------
-- Returns ranked IDS and match metadata, not question rows. Three reasons:
--   * the caller already has tested enrichment code (sources, topics, attempt
--     summaries, usage counts) that stays untouched;
--   * database.generated.ts is stale for this table, so enumerating 40 columns
--     in a RETURNS TABLE would need casts everywhere and drift again;
--   * ranking, paging and the total all still happen in one indexed round trip.
--
-- The fallback ladder, so a search is never a dead end:
--   1. all terms present (prefix matched)          match_kind = 'text'
--   2. nothing? any term present                   match_kind = 'partial'
--   3. still nothing? trigram similarity           match_kind = 'fuzzy'
--
-- Threshold 0.45 for step 3 was measured against this corpus, not guessed:
--   parabloa    -> 19 rows, and exactly 19 rows contain "parabola"
--   elipse      -> 32 rows, and exactly 32 rows contain "ellipse"
--   qwertyuiop  ->  0 rows
-- At 0.40 "parabloa" pulled 71 rows, well past the 19 real ones.
--
-- p_role picks the vector. It is interpolated as an IDENTIFIER through a
-- whitelist rather than used in a CASE expression, because
-- `CASE WHEN role='teacher' THEN full ELSE public END @@ q` cannot use either
-- GIN index and would silently seq scan.

-- Drop every existing overload by name first. CREATE OR REPLACE cannot change
-- a function's signature, so adding a parameter would otherwise leave the old
-- version in place and make every call ambiguous.
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname = 'nexus_qb_search'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END
$drop$;

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
  AND ($5 IS NULL OR q.exam_relevance::text = $5)
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

COMMENT ON FUNCTION nexus_qb_search IS
  'Ranked Question Bank search. Prefix matched full text with an any-term then trigram fallback, so a query is never a dead end. p_role selects the vector: students can never match or be shown explanation text.';
