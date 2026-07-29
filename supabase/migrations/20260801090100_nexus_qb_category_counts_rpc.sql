-- ============================================================
-- Nexus QB: category facet counts as a real RPC
--
-- getQBCategoryCounts() called supabase.rpc('exec_sql', { query: <string> }).
-- That function does not exist in this database, so the call always failed and
-- silently fell through to a JS fallback capped at PostgREST's 1000-row default.
-- With 1121 active questions, every category count shown to students has been
-- under-reported, and the error grows as the bank grows.
--
-- This replaces it with a typed, parameterized function (no string-built SQL,
-- so no injection surface) that also returns the parent rollup in the same pass.
--
-- rollup_count uses COUNT(DISTINCT q.id) over the tag's transitive closure, not
-- a sum of children. A question tagged both `locus` and `parabola` (these exist)
-- must count ONCE toward Coordinate Geometry.
-- ============================================================

CREATE OR REPLACE FUNCTION nexus_qb_category_counts(
  p_exam_type text DEFAULT NULL,
  p_year      int  DEFAULT NULL,
  p_session   text DEFAULT NULL,
  p_shift     text DEFAULT NULL
)
RETURNS TABLE (
  slug         text,
  self_count   bigint,
  rollup_count bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE walk(root_slug, node_slug, depth) AS (
    -- Every active subject tag is the root of its own closure (depth 0),
    -- so leaves get a rollup equal to their self count for free.
    SELECT t.slug, t.slug, 0
    FROM nexus_qb_tags t
    WHERE t.group_type = 'subject' AND t.is_active = true
    UNION ALL
    SELECT w.root_slug, c.slug, w.depth + 1
    FROM walk w
    JOIN nexus_qb_tags p ON p.slug = w.node_slug AND p.group_type = 'subject'
    JOIN nexus_qb_tags c ON c.parent_id = p.id AND c.is_active = true
    WHERE w.depth < 5
  ),
  tree AS (
    SELECT DISTINCT root_slug, node_slug FROM walk
  ),
  scoped AS (
    SELECT q.id, q.categories
    FROM nexus_qb_questions q
    WHERE q.is_active = true
      AND q.status = 'active'
      AND (
        p_exam_type IS NULL
        OR EXISTS (
          SELECT 1
          FROM nexus_qb_question_sources s
          WHERE s.question_id = q.id
            AND s.exam_type = p_exam_type
            AND (p_year    IS NULL OR s.year    = p_year)
            AND (p_session IS NULL OR s.session = p_session)
            AND (p_shift   IS NULL OR s.shift   = p_shift)
        )
      )
  ),
  exploded AS (
    SELECT DISTINCT s.id, c.cat
    FROM scoped s
    CROSS JOIN LATERAL unnest(s.categories) AS c(cat)
  ),
  tagged AS (
    SELECT t.root_slug AS slug,
           COUNT(DISTINCT e.id) FILTER (WHERE e.cat = t.root_slug) AS self_count,
           COUNT(DISTINCT e.id)                                    AS rollup_count
    FROM tree t
    LEFT JOIN exploded e ON e.cat = t.node_slug
    GROUP BY t.root_slug
  ),
  untagged AS (
    -- Slugs present in categories[] but absent from the registry. Without this
    -- they would vanish from the facet list entirely; ~127 active questions
    -- currently sit on off-vocabulary slugs.
    SELECT e.cat AS slug,
           COUNT(DISTINCT e.id) AS self_count,
           COUNT(DISTINCT e.id) AS rollup_count
    FROM exploded e
    WHERE NOT EXISTS (
      SELECT 1 FROM nexus_qb_tags t
      WHERE t.slug = e.cat AND t.group_type = 'subject'
    )
    GROUP BY e.cat
  )
  SELECT * FROM tagged
  UNION ALL
  SELECT * FROM untagged;
$$;

COMMENT ON FUNCTION nexus_qb_category_counts(text, int, text, text) IS
  'Facet counts per subject slug. self_count = questions carrying that exact slug; rollup_count = DISTINCT questions carrying that slug or any descendant via nexus_qb_tags.parent_id.';
