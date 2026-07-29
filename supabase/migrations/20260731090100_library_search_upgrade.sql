-- ============================================================
-- Class Library search: weighted, typo tolerant, tag aware
-- ============================================================
-- The old search_vector folded title + description + topics into a single
-- unweighted 'english' tsvector. Three things were wrong with that:
--
--   1. A video with only original_title set was unsearchable, because the
--      trigger never read original_title.
--   2. key_concepts, subcategories and category were never indexed, so the
--      keyword list we now generate for every upload would have been ignored.
--   3. Everything ranked equally, so a passing mention in a long description
--      outranked an exact title match.
--
-- This migration rebuilds the vector with weights and a dual config, adds a
-- trigram column for typo tolerance, and puts the whole search behind one RPC
-- so the ranking logic lives in one testable place instead of the client.

-- ============================================================
-- 1. Weighted search vector + trigram text, both from one trigger
-- ============================================================
-- search_vector: 'simple' indexes tokens verbatim, 'english' indexes them
-- stemmed. Keeping both means "perspectives" finds "perspective" (stemmed)
-- while an exact term like "3d" or a Tamil-script word still survives.
--
-- search_text_norm: the trigram surface for typo tolerance, so "prespective",
-- "vanising point" and "trignometry" still land. It cannot be a generated
-- STORED column the way nexus_qb_questions.question_text_norm is, because
-- array_to_string() is only STABLE and Postgres rejects it in a generation
-- expression. The search_vector trigger already fires on every insert and
-- update, so it fills this column too.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE library_videos
  ADD COLUMN IF NOT EXISTS search_text_norm text;

CREATE INDEX IF NOT EXISTS idx_library_videos_text_trgm
  ON library_videos USING gin (search_text_norm gin_trgm_ops);

CREATE OR REPLACE FUNCTION update_library_search_vector()
RETURNS TRIGGER AS $$
DECLARE
  v_title text := COALESCE(NEW.approved_title, NEW.suggested_title, NEW.original_title, '');
  v_desc  text := COALESCE(NEW.approved_description, NEW.suggested_description, NEW.original_description, '');
  v_topics text := array_to_string(COALESCE(NEW.topics, '{}'), ' ');
  v_terms text := array_to_string(COALESCE(NEW.key_concepts, '{}'), ' ');
  v_tags  text := v_topics || ' ' ||
                  array_to_string(COALESCE(NEW.subcategories, '{}'), ' ') || ' ' ||
                  v_terms || ' ' ||
                  COALESCE(replace(NEW.category, '_', ' '), '');
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('simple',  v_title), 'A')
   || setweight(to_tsvector('english', v_title), 'A')
   || setweight(to_tsvector('simple',  v_tags),  'B')
   || setweight(to_tsvector('english', v_tags),  'B')
   || setweight(to_tsvector('english', v_desc),  'C');

  NEW.search_text_norm := nexus_qb_normalize(v_title || ' ' || v_topics || ' ' || v_terms);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Existing rows carry a vector built by the old trigger and no normalized text
-- at all. Touch every row so the new trigger fills both. Cheap: this table holds
-- hundreds of rows, not millions.
UPDATE library_videos SET updated_at = updated_at;

-- ============================================================
-- 3. Query expansion: student words to canonical tag labels
-- ============================================================
-- A student types "vanishing point". No title contains it, but the canonical
-- tag "Perspective" lists it as an alias, and every perspective class carries
-- that tag in topics[]. This resolves the query to tag labels so those classes
-- come back.

CREATE OR REPLACE FUNCTION library_expand_query(p_query text)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT t.label), '{}')
  FROM nexus_qb_tags t
  WHERE t.is_active = true
    AND nexus_qb_normalize(p_query) <> ''
    AND (
      -- the query is the tag itself
      nexus_qb_normalize(t.label) = nexus_qb_normalize(p_query)
      OR t.slug = replace(nexus_qb_normalize(p_query), ' ', '_')
      -- the query is, or contains, one of the tag's aliases
      OR EXISTS (
        SELECT 1 FROM unnest(t.aliases) a
        WHERE length(nexus_qb_normalize(a)) >= 4
          AND (
            nexus_qb_normalize(a) = nexus_qb_normalize(p_query)
            OR nexus_qb_normalize(p_query) LIKE '%' || nexus_qb_normalize(a) || '%'
          )
      )
      -- the query names the tag inside a longer phrase ("perspective drawing")
      OR (length(nexus_qb_normalize(t.label)) >= 4
          AND nexus_qb_normalize(p_query) LIKE '%' || nexus_qb_normalize(t.label) || '%')
    )
$$;

-- ============================================================
-- 4. The search RPC
-- ============================================================
-- One round trip returns the page, the ranking, why each row matched, and the
-- total. Order of attack:
--   1. no query        -> plain browse, newest first
--   2. full text       -> weighted ts_rank_cd, with expanded tag labels folded
--                         into the tsquery
--   3. nothing found   -> word_similarity fallback (typos), first page only
--
-- The expanded tag labels go INTO the tsquery rather than into a separate
-- `topics && labels` filter. Two reasons. It stays on the GIN index, and it is
-- case insensitive for free: the canonical registry label is "Perspective" but
-- the 900-odd videos already classified by the channel importer wrote lowercase
-- free text like "perspective" and "vanishing point", so an array equality test
-- would silently miss every one of them.
--
-- websearch_to_tsquery never throws on stray operators, so callers do not need
-- to sanitize the query string the way the old client-side textSearch did.

CREATE OR REPLACE FUNCTION library_search(
  p_query      text DEFAULT NULL,
  p_exam       text DEFAULT NULL,
  p_language   text DEFAULT NULL,
  p_category   text DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_limit      int  DEFAULT 20,
  p_offset     int  DEFAULT 0
)
RETURNS TABLE (
  id                        uuid,
  youtube_video_id          text,
  approved_title            text,
  suggested_title           text,
  original_title            text,
  approved_description      text,
  suggested_description     text,
  youtube_thumbnail_url     text,
  youtube_thumbnail_hq_url  text,
  duration_seconds          integer,
  exam                      text,
  language                  text,
  difficulty                text,
  category                  text,
  topics                    text[],
  subcategories             text[],
  published_at              timestamptz,
  view_count                integer,
  rank                      real,
  match_kind                text,
  matched_topics            text[],
  total_count               bigint
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_q       text   := btrim(COALESCE(p_query, ''));
  v_norm    text   := nexus_qb_normalize(p_query);
  v_labels  text[] := '{}';
  v_norm_labels text[] := '{}';
  v_label   text;
  v_tsq     tsquery;
  v_hits    bigint := 0;
BEGIN
  -- --- 1. No query: plain browse ---------------------------------------------
  IF v_q = '' THEN
    RETURN QUERY
    SELECT v.id, v.youtube_video_id, v.approved_title, v.suggested_title, v.original_title,
           v.approved_description, v.suggested_description,
           v.youtube_thumbnail_url, v.youtube_thumbnail_hq_url, v.duration_seconds,
           v.exam, v.language, v.difficulty, v.category, v.topics, v.subcategories,
           v.published_at, v.view_count,
           0::real, 'browse'::text, '{}'::text[],
           count(*) OVER ()
    FROM library_videos v
    WHERE v.is_published = true
      AND (p_exam       IS NULL OR v.exam       = p_exam)
      AND (p_language   IS NULL OR v.language   = p_language)
      AND (p_category   IS NULL OR v.category   = p_category)
      AND (p_difficulty IS NULL OR v.difficulty = p_difficulty)
    ORDER BY v.published_at DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  v_labels := library_expand_query(v_q);
  v_norm_labels := ARRAY(SELECT nexus_qb_normalize(l) FROM unnest(v_labels) l);

  v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
  FOREACH v_label IN ARRAY v_labels LOOP
    v_tsq := v_tsq || phraseto_tsquery('simple', v_label);
  END LOOP;

  -- --- 2. Full text, with the expanded tag labels folded in ------------------
  RETURN QUERY
  SELECT v.id, v.youtube_video_id, v.approved_title, v.suggested_title, v.original_title,
         v.approved_description, v.suggested_description,
         v.youtube_thumbnail_url, v.youtube_thumbnail_hq_url, v.duration_seconds,
         v.exam, v.language, v.difficulty, v.category, v.topics, v.subcategories,
         v.published_at, v.view_count,
         -- Carrying the canonical topic is a stronger signal than a passing text
         -- match, so it gets a flat boost on top of the text rank.
         (ts_rank_cd(v.search_vector, v_tsq)
          + CASE WHEN EXISTS (SELECT 1 FROM unnest(v.topics) tp
                              WHERE nexus_qb_normalize(tp) = ANY(v_norm_labels))
                 THEN 0.5 ELSE 0 END)::real,
         CASE WHEN EXISTS (SELECT 1 FROM unnest(v.topics) tp
                           WHERE nexus_qb_normalize(tp) = ANY(v_norm_labels))
              THEN 'topic' ELSE 'text' END::text,
         ARRAY(SELECT tp FROM unnest(v.topics) tp
               WHERE nexus_qb_normalize(tp) = ANY(v_norm_labels)),
         count(*) OVER ()
  FROM library_videos v
  WHERE v.is_published = true
    AND (p_exam       IS NULL OR v.exam       = p_exam)
    AND (p_language   IS NULL OR v.language   = p_language)
    AND (p_category   IS NULL OR v.category   = p_category)
    AND (p_difficulty IS NULL OR v.difficulty = p_difficulty)
    AND v.search_vector @@ v_tsq
  ORDER BY 19 DESC, v.published_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;

  GET DIAGNOSTICS v_hits = ROW_COUNT;
  IF v_hits > 0 OR p_offset > 0 THEN
    RETURN;
  END IF;

  -- --- 3. Nothing matched: typo tolerant fallback ----------------------------
  -- word_similarity, not similarity. Plain similarity compares the query
  -- against the WHOLE document, so a one-word query against a title plus its
  -- topic list scores near zero: measured on staging, "prespective" scores
  -- 0.15 that way and would never clear any usable threshold. word_similarity
  -- scores the query against the best matching extent inside the document,
  -- where the same typo scores 0.58. Threshold 0.4 clears real misspellings
  -- ("trignometry" 0.42, "architecure" 0.80) and rejects noise ("qwertyuiop"
  -- 0.09). Seq scan is fine here: this path only runs when the indexed search
  -- already came back empty.
  RETURN QUERY
  SELECT v.id, v.youtube_video_id, v.approved_title, v.suggested_title, v.original_title,
         v.approved_description, v.suggested_description,
         v.youtube_thumbnail_url, v.youtube_thumbnail_hq_url, v.duration_seconds,
         v.exam, v.language, v.difficulty, v.category, v.topics, v.subcategories,
         v.published_at, v.view_count,
         word_similarity(v_norm, v.search_text_norm)::real,
         'fuzzy'::text,
         '{}'::text[],
         count(*) OVER ()
  FROM library_videos v
  WHERE v.is_published = true
    AND (p_exam       IS NULL OR v.exam       = p_exam)
    AND (p_language   IS NULL OR v.language   = p_language)
    AND (p_category   IS NULL OR v.category   = p_category)
    AND (p_difficulty IS NULL OR v.difficulty = p_difficulty)
    AND v_norm <> ''
    AND word_similarity(v_norm, v.search_text_norm) >= 0.4
  ORDER BY 19 DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================
-- 5. Popular topics, for the discovery chips on the Library home
-- ============================================================
-- Only topics that actually have published videos behind them, so a student
-- never taps a chip and lands on an empty page.

CREATE OR REPLACE FUNCTION library_topic_counts(p_limit int DEFAULT 20)
RETURNS TABLE (topic text, video_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT tp AS topic, count(*)::bigint AS video_count
  FROM library_videos v, unnest(v.topics) AS tp
  WHERE v.is_published = true
  GROUP BY tp
  ORDER BY count(*) DESC, tp ASC
  LIMIT p_limit
$$;
