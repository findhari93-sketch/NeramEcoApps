-- ============================================================
-- Nexus QB: category facet counts scoped to the section being practised
--
-- A student on "JEE Paper 2 2019 Session 1, Mathematics" (30 questions) opened
-- Filters and saw Mathematics (60), Aptitude (100), Drawing (6). The counts were
-- scoped by exam, year and session only: both shifts of that session and every
-- section of the paper were counted, so the drawer offered categories the list
-- could never show.
--
-- This adds p_section (the same values as nexus_qb_questions.section, e.g.
-- 'math_mcq') so the facet counts match the list the student is looking at.
-- The page now also sends the shift it already had in the URL.
--
-- The 4-argument version is dropped rather than overloaded: two candidates with
-- defaulted arguments make PostgREST's function resolution ambiguous.
-- ============================================================

DROP FUNCTION IF EXISTS nexus_qb_category_counts(text, int, text, text);

CREATE OR REPLACE FUNCTION nexus_qb_category_counts(
  p_exam_type text   DEFAULT NULL,
  p_year      int    DEFAULT NULL,
  p_session   text   DEFAULT NULL,
  p_shift     text   DEFAULT NULL,
  p_section   text[] DEFAULT NULL
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
      AND (p_section IS NULL OR cardinality(p_section) = 0 OR q.section = ANY(p_section))
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
    -- Slugs present in categories[] but absent from the registry, so they do
    -- not vanish from the facet list.
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

COMMENT ON FUNCTION nexus_qb_category_counts(text, int, text, text, text[]) IS
  'Facet counts per subject slug, scoped by exam/year/session/shift and optionally section. self_count = questions carrying that exact slug; rollup_count = DISTINCT questions carrying that slug or any descendant via nexus_qb_tags.parent_id.';

GRANT EXECUTE ON FUNCTION nexus_qb_category_counts(text, int, text, text, text[]) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
