-- ============================================================
-- Nexus QB: category slug hygiene
--
-- 80 distinct slugs in nexus_qb_questions.categories have no matching subject
-- tag, so they are invisible in the Category filter. 14 of them sit on ACTIVE
-- questions, roughly 127 questions students cannot currently filter to. The
-- worst case is `3d_visualization` with 17 active questions while the canonical
-- `visualization_3d` has none.
--
-- Two moves, in this order:
--   1. ADD the slugs that name a real topic (2d_composition, kit_sculpture, ...)
--      rather than deleting genuine data.
--   2. ALIAS the slugs that are just a spelling of something that already
--      exists (3d_visualization, hyphen-for-underscore variants, ...).
--
-- Idempotent throughout: the aliasing only ever rewrites a slug to its
-- canonical twin, so a second run is a no-op.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New vocabulary. These name real topics with real questions behind them,
--    so they get tags rather than being folded into something else.
-- ------------------------------------------------------------
INSERT INTO nexus_qb_tags (group_type, slug, label, is_system, sort_order) VALUES
  ('subject', '2d_composition', '2D Composition',  true, 21),
  ('subject', '3d_composition', '3D Composition',  true, 22),
  ('subject', 'kit_sculpture',  'Kit Sculpture',   true, 23),
  ('subject', 'geography_gk',   'Geography GK',    true, 24),
  ('subject', 'environment_gk', 'Environment GK',  true, 25),
  ('subject', 'logarithms',     'Logarithms',      true, 519)
ON CONFLICT (slug) DO NOTHING;

-- Logarithms belongs under Algebra like every other pure-algebra topic.
UPDATE nexus_qb_tags c
SET parent_id = p.id, updated_at = now()
FROM nexus_qb_tags p
WHERE p.slug = 'algebra' AND p.group_type = 'subject'
  AND c.slug = 'logarithms' AND c.group_type = 'subject'
  AND c.parent_id IS DISTINCT FROM p.id;

-- ------------------------------------------------------------
-- 2. Explicit aliases. Each left-hand slug is a spelling or a near-synonym of
--    a slug that already exists in the registry.
--
--    `coordinate-geometry` maps to nothing on purpose: it is now a PARENT in
--    the hierarchy, and a parent slug must never sit on a question, because
--    filtering expands parents into leaves. Those rows (all inactive) simply
--    lose it.
-- ------------------------------------------------------------
CREATE TEMP TABLE _qb_alias(from_slug text PRIMARY KEY, to_slug text) ON COMMIT DROP;

INSERT INTO _qb_alias(from_slug, to_slug) VALUES
  ('3d_visualization',   'visualization_3d'),
  ('3d-visualization',   'visualization_3d'),
  ('sets',               'sets_and_relations'),
  ('hidden_figure',      'embedded_figure'),
  ('figure_analogy',     'analogy'),
  ('figure_matching',    'analogy'),
  ('sequence_completion', 'pattern_recognition'),
  ('counting_lines',     'counting_figures'),
  ('area_under_curves',  'definite_integrals'),
  ('spatial-reasoning',  'spatial_visualization'),
  ('coordinate-geometry', NULL);

-- Generic hyphen -> underscore, but only where the underscore form is a real
-- subject tag. This catches straight-lines, complex-numbers, 3d-geometry,
-- definite-integrals, sequences-series and friends without naming each one,
-- and cannot invent a slug that does not exist.
INSERT INTO _qb_alias(from_slug, to_slug)
SELECT DISTINCT e.cat, replace(e.cat, '-', '_')
FROM (SELECT unnest(categories) AS cat FROM nexus_qb_questions) e
WHERE e.cat LIKE '%-%'
  AND EXISTS (
    SELECT 1 FROM nexus_qb_tags t
    WHERE t.slug = replace(e.cat, '-', '_') AND t.group_type = 'subject'
  )
ON CONFLICT (from_slug) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Rewrite categories[]: map aliased slugs, drop NULL-mapped ones, dedupe.
--    Only touches rows that actually contain an aliased slug.
-- ------------------------------------------------------------
UPDATE nexus_qb_questions q
SET categories = COALESCE((
      SELECT array_agg(DISTINCT COALESCE(a.to_slug, c) ORDER BY COALESCE(a.to_slug, c))
      FROM unnest(q.categories) AS c
      LEFT JOIN _qb_alias a ON a.from_slug = c
      WHERE a.from_slug IS NULL OR a.to_slug IS NOT NULL
    ), '{}'),
    updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM unnest(q.categories) AS c
  JOIN _qb_alias a ON a.from_slug = c
);

-- ------------------------------------------------------------
-- 4. Re-run the categories[] -> subject tag backfill from 20260713180000 so the
--    join table picks up both the newly added vocabulary and the aliased slugs.
--    Nothing in the database keeps these two in step on its own.
-- ------------------------------------------------------------
INSERT INTO nexus_qb_question_tags (question_id, tag_id)
SELECT DISTINCT q.id, t.id
FROM nexus_qb_questions q
CROSS JOIN LATERAL unnest(q.categories) AS c(slug)
JOIN nexus_qb_tags t ON t.slug = c.slug AND t.group_type = 'subject'
ON CONFLICT (question_id, tag_id) DO NOTHING;

-- Drop tag links for the slugs this migration aliased away, and ONLY those.
--
-- A blanket "delete every subject tag not in categories[]" would be wrong: the
-- tagging assistant can add subject tags directly without touching categories[],
-- and those are deliberate. Only the slugs in _qb_alias are known-stale.
DELETE FROM nexus_qb_question_tags qt
USING nexus_qb_tags t, _qb_alias a
WHERE qt.tag_id = t.id
  AND t.group_type = 'subject'
  AND t.slug = a.from_slug;
