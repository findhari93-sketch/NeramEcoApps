-- ============================================
-- INSPIRATION SEARCH
--
-- nexus_inspiration_base is the one place that decides who sees what:
-- visibility, the opt-out rule, filters and "saved". Every other function
-- reads through it, so a student can never reach a row the base refuses.
--
-- Search order, copied from library_search:
--   no query      browse (featured first, then newest)
--   every word    weighted full text, with tag aliases folded in
--   any word      when nothing has every word ("3D bag hat")
--   typo          word_similarity >= 0.4, first page only
-- ============================================

CREATE OR REPLACE FUNCTION nexus_inspiration_base(
  p_types      text[],
  p_exam       text,
  p_by         text,
  p_year       smallint,
  p_scope      text,
  p_viewer_id  uuid,
  p_saved_only boolean
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz, search_vector tsvector, search_text_norm text,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean
)
LANGUAGE sql
STABLE
AS $fn$
  WITH item_rows AS (
    SELECT i.*,
           coalesce(u.share_drawings_opt_out, false) AS opted_out,
           u.name AS u_name, u.first_name AS u_first, u.last_name AS u_last,
           coalesce(u.is_alumni, false) AS u_alumni, u.academic_year AS u_year,
           (i.is_visible AND NOT (i.source_kind = 'submission_original' AND coalesce(u.share_drawings_opt_out, false))) AS student_visible
      FROM nexus_inspiration_items i
      LEFT JOIN users u ON u.id = i.author_id
  )
  SELECT r.id, r.source_kind, r.source_submission_id, r.source_drawing_question_id,
         r.image_url, r.thumbnail_url, r.image_aspect, r.title_override, coalesce(r.brief_override, r.brief),
         r.category, r.type_slugs, r.tag_labels, r.exam_types, r.paper_years,
         r.is_featured, r.student_visible, r.curation, r.auto_eligible, r.score_pct,
         r.save_count, r.source_created_at, r.search_vector, r.search_text_norm,
         CASE WHEN r.opted_out THEN NULL ELSE r.author_id END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_name END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_first END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_last END,
         CASE WHEN r.opted_out THEN false ELSE r.u_alumni END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_year END,
         r.opted_out,
         EXISTS (SELECT 1 FROM nexus_inspiration_saves sv WHERE sv.item_id = r.id AND sv.user_id = p_viewer_id)
    FROM item_rows r
   WHERE (CASE coalesce(p_scope, 'visible')
            WHEN 'all' THEN true
            WHEN 'hidden' THEN NOT r.student_visible
                           AND (r.curation = 'hidden' OR r.score_pct IS NOT NULL OR r.source_kind <> 'submission_original')
            ELSE r.student_visible
          END)
     AND (p_types IS NULL OR cardinality(p_types) = 0 OR r.type_slugs && p_types)
     AND (p_exam IS NULL OR p_exam = ANY(r.exam_types))
     AND (p_year IS NULL OR p_year = ANY(r.paper_years))
     AND (p_by IS NULL
          OR (p_by = 'reference' AND r.source_kind <> 'submission_original')
          OR (p_by = 'current'   AND r.source_kind = 'submission_original' AND NOT r.u_alumni)
          OR (p_by = 'alumni'    AND r.source_kind = 'submission_original' AND r.u_alumni))
     AND (NOT coalesce(p_saved_only, false)
          OR EXISTS (SELECT 1 FROM nexus_inspiration_saves sv WHERE sv.item_id = r.id AND sv.user_id = p_viewer_id))
$fn$;

CREATE OR REPLACE FUNCTION nexus_inspiration_search(
  p_query      text     DEFAULT NULL,
  p_types      text[]   DEFAULT NULL,
  p_exam       text     DEFAULT NULL,
  p_by         text     DEFAULT NULL,
  p_year       smallint DEFAULT NULL,
  p_sort       text     DEFAULT 'relevant',
  p_scope      text     DEFAULT 'visible',
  p_viewer_id  uuid     DEFAULT NULL,
  p_saved_only boolean  DEFAULT false,
  p_limit      int      DEFAULT 30,
  p_offset     int      DEFAULT 0
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean,
  rank real, match_kind text, total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $fn$
#variable_conflict use_column
DECLARE
  v_q     text := btrim(coalesce(p_query, ''));
  v_norm  text := nexus_qb_normalize(p_query);
  v_label text;
  v_tsq   tsquery;
  v_any   tsquery;
BEGIN
  IF v_q = '' THEN
    RETURN QUERY
    SELECT b.id, b.source_kind, b.source_submission_id, b.source_drawing_question_id,
           b.image_url, b.thumbnail_url, b.image_aspect, b.title_override, b.brief,
           b.category, b.type_slugs, b.tag_labels, b.exam_types, b.paper_years,
           b.is_featured, b.is_visible, b.curation, b.auto_eligible, b.score_pct,
           b.save_count, b.source_created_at,
           b.author_id, b.author_name, b.author_first_name, b.author_last_name,
           b.author_is_alumni, b.author_academic_year, b.author_opted_out, b.is_saved,
           0::real, 'browse'::text, count(*) OVER ()
      FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
     ORDER BY
       CASE WHEN p_sort = 'saved' THEN b.save_count END DESC NULLS LAST,
       CASE WHEN p_sort = 'relevant' THEN b.is_featured END DESC NULLS LAST,
       b.source_created_at DESC, b.id
     LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
  FOREACH v_label IN ARRAY library_expand_query(v_q) LOOP
    v_tsq := v_tsq || phraseto_tsquery('simple', v_label);
  END LOOP;

  -- Choose the stage by existence, not by this page's row count: a later page
  -- of a real text match must not be mistaken for "nothing matched".
  PERFORM 1 FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
   WHERE b.search_vector @@ v_tsq LIMIT 1;
  IF FOUND THEN
    RETURN QUERY
    SELECT x.id, x.source_kind, x.source_submission_id, x.source_drawing_question_id,
           x.image_url, x.thumbnail_url, x.image_aspect, x.title_override, x.brief,
           x.category, x.type_slugs, x.tag_labels, x.exam_types, x.paper_years,
           x.is_featured, x.is_visible, x.curation, x.auto_eligible, x.score_pct,
           x.save_count, x.source_created_at,
           x.author_id, x.author_name, x.author_first_name, x.author_last_name,
           x.author_is_alumni, x.author_academic_year, x.author_opted_out, x.is_saved,
           x.rnk, 'text'::text, count(*) OVER ()
      FROM (SELECT b.*, ts_rank_cd(b.search_vector, v_tsq)::real AS rnk
              FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
             WHERE b.search_vector @@ v_tsq) x
     ORDER BY
       CASE WHEN p_sort = 'saved' THEN x.save_count END DESC NULLS LAST,
       CASE WHEN p_sort = 'relevant' THEN x.rnk END DESC NULLS LAST,
       CASE WHEN p_sort = 'relevant' THEN x.is_featured END DESC NULLS LAST,
       x.source_created_at DESC, x.id
     LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- Nothing has every word. "3D bag hat" should still find the bag drawings.
  -- Same existence check and the same ORDER BY as the text stage, so paging
  -- and p_sort behave identically once a query has fallen back to "any".
  v_any := nullif(replace(plainto_tsquery('simple', v_q)::text, ' & ', ' | '), '')::tsquery;
  IF v_any IS NOT NULL THEN
    v_any := v_any || coalesce(nullif(replace(plainto_tsquery('english', v_q)::text, ' & ', ' | '), '')::tsquery, v_any);

    PERFORM 1 FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
     WHERE b.search_vector @@ v_any LIMIT 1;
    IF FOUND THEN
      RETURN QUERY
      SELECT x.id, x.source_kind, x.source_submission_id, x.source_drawing_question_id,
             x.image_url, x.thumbnail_url, x.image_aspect, x.title_override, x.brief,
             x.category, x.type_slugs, x.tag_labels, x.exam_types, x.paper_years,
             x.is_featured, x.is_visible, x.curation, x.auto_eligible, x.score_pct,
             x.save_count, x.source_created_at,
             x.author_id, x.author_name, x.author_first_name, x.author_last_name,
             x.author_is_alumni, x.author_academic_year, x.author_opted_out, x.is_saved,
             x.rnk, 'any'::text, count(*) OVER ()
        FROM (SELECT b.*, ts_rank_cd(b.search_vector, v_any)::real AS rnk
                FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
               WHERE b.search_vector @@ v_any) x
       ORDER BY
         CASE WHEN p_sort = 'saved' THEN x.save_count END DESC NULLS LAST,
         CASE WHEN p_sort = 'relevant' THEN x.rnk END DESC NULLS LAST,
         CASE WHEN p_sort = 'relevant' THEN x.is_featured END DESC NULLS LAST,
         x.source_created_at DESC, x.id
       LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;
  END IF;

  -- Typos. word_similarity scores the query against its best matching stretch
  -- of the document, which is what makes a one-word typo clear 0.4. First
  -- page only: the inner ORDER BY + LIMIT picks the page, and the outer
  -- count(*) OVER () then equals exactly the rows returned.
  IF p_offset > 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT y.id, y.source_kind, y.source_submission_id, y.source_drawing_question_id,
         y.image_url, y.thumbnail_url, y.image_aspect, y.title_override, y.brief,
         y.category, y.type_slugs, y.tag_labels, y.exam_types, y.paper_years,
         y.is_featured, y.is_visible, y.curation, y.auto_eligible, y.score_pct,
         y.save_count, y.source_created_at,
         y.author_id, y.author_name, y.author_first_name, y.author_last_name,
         y.author_is_alumni, y.author_academic_year, y.author_opted_out, y.is_saved,
         y.rnk, 'fuzzy'::text, count(*) OVER ()
    FROM (
      SELECT x.*
        FROM (SELECT b.*, word_similarity(v_norm, b.search_text_norm)::real AS rnk
                FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
               WHERE v_norm <> '' AND word_similarity(v_norm, b.search_text_norm) >= 0.4) x
       ORDER BY x.rnk DESC, x.source_created_at DESC, x.id
       LIMIT p_limit
    ) y;
END;
$fn$;

-- Chip counts. Each facet is counted with every OTHER filter applied, so a
-- chip always says how many drawings tapping it would show.
CREATE OR REPLACE FUNCTION nexus_inspiration_facets(
  p_query     text,
  p_types     text[],
  p_exam      text,
  p_by        text,
  p_year      smallint,
  p_scope     text,
  p_viewer_id uuid
)
RETURNS TABLE (facet text, value text, label text, item_count bigint)
LANGUAGE sql
STABLE
AS $fn$
  WITH
  t AS (SELECT s.id FROM nexus_inspiration_search(p_query, NULL,    p_exam, p_by, p_year, 'newest', p_scope, p_viewer_id, false, 10000, 0) s),
  e AS (SELECT s.id FROM nexus_inspiration_search(p_query, p_types, NULL,   p_by, p_year, 'newest', p_scope, p_viewer_id, false, 10000, 0) s),
  b AS (SELECT s.id FROM nexus_inspiration_search(p_query, p_types, p_exam, NULL, p_year, 'newest', p_scope, p_viewer_id, false, 10000, 0) s),
  y AS (SELECT s.id FROM nexus_inspiration_search(p_query, p_types, p_exam, p_by, NULL,   'newest', p_scope, p_viewer_id, false, 10000, 0) s)
  -- count(DISTINCT i.id) everywhere: a slug repeated in the tag registry must
  -- never double a chip's count.
  SELECT 'type'::text, ts.slug,
         (SELECT max(tg.label) FROM nexus_qb_tags tg WHERE tg.slug = ts.slug),
         count(DISTINCT i.id)
    FROM t JOIN nexus_inspiration_items i ON i.id = t.id
    CROSS JOIN LATERAL unnest(i.type_slugs) AS ts(slug)
   GROUP BY ts.slug
  UNION ALL
  SELECT 'exam'::text, ex.v, CASE ex.v WHEN 'NATA' THEN 'NATA' ELSE 'JEE Paper 2' END, count(DISTINCT i.id)
    FROM e JOIN nexus_inspiration_items i ON i.id = e.id
    CROSS JOIN LATERAL unnest(i.exam_types) AS ex(v)
   GROUP BY ex.v
  UNION ALL
  SELECT 'by'::text, k.v, NULL::text, count(DISTINCT i.id)
    FROM b JOIN nexus_inspiration_items i ON i.id = b.id
    LEFT JOIN users u ON u.id = i.author_id
    CROSS JOIN LATERAL (SELECT CASE WHEN i.source_kind <> 'submission_original' THEN 'reference'
                                    WHEN coalesce(u.is_alumni, false) THEN 'alumni'
                                    ELSE 'current' END AS v) k
   GROUP BY k.v
  UNION ALL
  SELECT 'year'::text, yr.v::text, yr.v::text, count(DISTINCT i.id)
    FROM y JOIN nexus_inspiration_items i ON i.id = y.id
    CROSS JOIN LATERAL unnest(i.paper_years) AS yr(v)
   GROUP BY yr.v
$fn$;

CREATE OR REPLACE FUNCTION nexus_inspiration_similar(
  p_item_id   uuid,
  p_viewer_id uuid,
  p_limit     int DEFAULT 12
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean,
  rank real, match_kind text, total_count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  WITH me AS (
    -- A hidden or opted-out seed must not leak its type_slugs into a similar
    -- list: this only yields a row when the seed itself is visible.
    SELECT i.id, i.source_submission_id, i.source_drawing_question_id, i.type_slugs
      FROM nexus_inspiration_items i
     WHERE i.id = p_item_id
       AND EXISTS (SELECT 1 FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, 'visible', p_viewer_id, false) v WHERE v.id = p_item_id)
  ),
  scored AS (
    SELECT b.*,
           ((CASE WHEN me.source_drawing_question_id IS NOT NULL
                   AND b.source_drawing_question_id = me.source_drawing_question_id THEN 3 ELSE 0 END)
            + 2 * cardinality(ARRAY(SELECT unnest(b.type_slugs) INTERSECT SELECT unnest(me.type_slugs))))::real AS rnk
      FROM me,
           nexus_inspiration_base(NULL, NULL, NULL, NULL, 'visible', p_viewer_id, false) b
     WHERE b.id <> me.id
       AND (me.source_submission_id IS NULL OR b.source_submission_id IS DISTINCT FROM me.source_submission_id)
  )
  SELECT s.id, s.source_kind, s.source_submission_id, s.source_drawing_question_id,
         s.image_url, s.thumbnail_url, s.image_aspect, s.title_override, s.brief,
         s.category, s.type_slugs, s.tag_labels, s.exam_types, s.paper_years,
         s.is_featured, s.is_visible, s.curation, s.auto_eligible, s.score_pct,
         s.save_count, s.source_created_at,
         s.author_id, s.author_name, s.author_first_name, s.author_last_name,
         s.author_is_alumni, s.author_academic_year, s.author_opted_out, s.is_saved,
         s.rnk, 'similar'::text, count(*) OVER ()
    FROM scored s
   WHERE s.rnk > 0
   ORDER BY s.rnk DESC, s.is_featured DESC, s.source_created_at DESC, s.id
   LIMIT p_limit
$fn$;

-- One item plus its pair (the other image of the same submission), in the
-- caller's scope. A student asking for a hidden item gets zero rows.
CREATE OR REPLACE FUNCTION nexus_inspiration_get(
  p_item_id   uuid,
  p_viewer_id uuid,
  p_scope     text DEFAULT 'visible'
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean,
  rank real, match_kind text, total_count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT b.id, b.source_kind, b.source_submission_id, b.source_drawing_question_id,
         b.image_url, b.thumbnail_url, b.image_aspect, b.title_override, b.brief,
         b.category, b.type_slugs, b.tag_labels, b.exam_types, b.paper_years,
         b.is_featured, b.is_visible, b.curation, b.auto_eligible, b.score_pct,
         b.save_count, b.source_created_at,
         b.author_id, b.author_name, b.author_first_name, b.author_last_name,
         b.author_is_alumni, b.author_academic_year, b.author_opted_out, b.is_saved,
         0::real,
         CASE WHEN b.id = p_item_id THEN 'item' ELSE 'pair' END,
         1::bigint
    FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, p_scope, p_viewer_id, false) b
   WHERE b.id = p_item_id
      OR (b.source_submission_id IS NOT NULL
          AND b.source_submission_id = (SELECT i.source_submission_id FROM nexus_inspiration_items i WHERE i.id = p_item_id)
          -- The pair must not surface unless the requested item itself
          -- passes this same scope: otherwise a refused item's visible
          -- sibling would leak it (and, via opt-out, tie a reference back
          -- to the student who opted out).
          AND EXISTS (SELECT 1 FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, p_scope, p_viewer_id, false) me WHERE me.id = p_item_id))
$fn$;

REVOKE ALL ON FUNCTION nexus_inspiration_base(text[], text, text, smallint, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_search(text, text[], text, text, smallint, text, text, uuid, boolean, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_facets(text, text[], text, text, smallint, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_similar(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_get(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_inspiration_base(text[], text, text, smallint, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_search(text, text[], text, text, smallint, text, text, uuid, boolean, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_facets(text, text[], text, text, smallint, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_similar(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_get(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
