-- ============================================================
-- Nexus QB: parent -> child subject hierarchy
--
-- nexus_qb_tags.parent_id has existed since 20260713180000 but was NULL on
-- every row. This migration finally uses it: six JEE-maths parents, with the
-- existing 24 math tags re-parented underneath, plus five new coordinate
-- geometry leaves that did not exist at all (every conic question was lumped
-- into a single `conic_sections` slug).
--
-- Everything here is keyed by slug and guarded by ON CONFLICT / WHERE, because
-- tag ids differ between staging and production. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New leaf subject tags (coordinate geometry sub-topics)
-- ------------------------------------------------------------
INSERT INTO nexus_qb_tags (group_type, slug, label, is_system, sort_order) VALUES
  ('subject', 'parabola',           'Parabola',           true, 513),
  ('subject', 'ellipse',            'Ellipse',            true, 514),
  ('subject', 'hyperbola',          'Hyperbola',          true, 515),
  ('subject', 'locus',              'Locus',              true, 516),
  ('subject', 'areas_of_triangles', 'Areas of Triangles', true, 517)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------
-- 2. New parent subject tags
--    `trigonometry` is deliberately absent here: it already exists as a leaf
--    and is promoted in place (step 3) rather than wrapped in a new tag, so
--    sub-topics can be hung off it later with no code change.
-- ------------------------------------------------------------
INSERT INTO nexus_qb_tags (group_type, slug, label, is_system, sort_order) VALUES
  ('subject', 'algebra',                    'Algebra',                  true, 50),
  ('subject', 'coordinate_geometry',        'Coordinate Geometry',      true, 51),
  ('subject', 'calculus',                   'Calculus',                 true, 52),
  ('subject', 'vectors_and_3d_geometry',    'Vectors & 3D Geometry',    true, 54),
  ('subject', 'probability_and_statistics', 'Probability & Statistics', true, 55)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Promote the existing trigonometry tag into the parent sort band.
--    A parent with zero children is a legal node and renders as a plain row.
-- ------------------------------------------------------------
UPDATE nexus_qb_tags
SET sort_order = 53, parent_id = NULL, updated_at = now()
WHERE slug = 'trigonometry' AND group_type = 'subject';

-- ------------------------------------------------------------
-- 4. Wire parent_id + child sort_order for all 29 children.
--    Slug-keyed join so it is environment independent and idempotent.
-- ------------------------------------------------------------
WITH m(child_slug, parent_slug, ord) AS (
  VALUES
    -- Algebra
    ('sets_and_relations',          'algebra', 501),
    ('functions',                   'algebra', 502),
    ('complex_numbers',             'algebra', 503),
    ('quadratic_equations',         'algebra', 504),
    ('sequences_and_series',        'algebra', 505),
    ('permutations_combinations',   'algebra', 506),
    ('binomial_theorem',            'algebra', 507),
    ('matrices',                    'algebra', 508),
    ('determinants',                'algebra', 509),
    ('mathematical_logic',          'algebra', 510),
    -- Coordinate Geometry
    ('straight_lines',              'coordinate_geometry', 511),
    ('circles',                     'coordinate_geometry', 512),
    ('parabola',                    'coordinate_geometry', 513),
    ('ellipse',                     'coordinate_geometry', 514),
    ('hyperbola',                   'coordinate_geometry', 515),
    ('locus',                       'coordinate_geometry', 516),
    ('areas_of_triangles',          'coordinate_geometry', 517),
    ('conic_sections',              'coordinate_geometry', 518),
    -- Calculus
    ('continuity',                  'calculus', 521),
    ('differentiability',           'calculus', 522),
    ('applications_of_derivatives', 'calculus', 523),
    ('mean_value_theorems',         'calculus', 524),
    ('indefinite_integrals',        'calculus', 525),
    ('definite_integrals',          'calculus', 526),
    ('differential_equations',      'calculus', 527),
    -- Vectors & 3D Geometry
    ('vectors',                     'vectors_and_3d_geometry', 541),
    ('3d_geometry',                 'vectors_and_3d_geometry', 542),
    -- Probability & Statistics
    ('probability',                 'probability_and_statistics', 551),
    ('statistics',                  'probability_and_statistics', 552)
)
UPDATE nexus_qb_tags c
SET parent_id = p.id,
    sort_order = m.ord,
    updated_at = now()
FROM m
JOIN nexus_qb_tags p ON p.slug = m.parent_slug AND p.group_type = 'subject'
WHERE c.slug = m.child_slug
  AND c.group_type = 'subject';

-- ------------------------------------------------------------
-- 5. Label corrections.
--    `conic_sections` stays as a transitional sibling of parabola/ellipse/
--    hyperbola so no data is lost while reclassification drains it. Once its
--    self-count reaches 0 it can simply be deactivated.
-- ------------------------------------------------------------
UPDATE nexus_qb_tags SET label = 'Conic Sections (General)', updated_at = now()
WHERE slug = 'conic_sections' AND group_type = 'subject';

UPDATE nexus_qb_tags SET label = 'Limits & Continuity', updated_at = now()
WHERE slug = 'continuity' AND group_type = 'subject';

-- ------------------------------------------------------------
-- 6. Index backing the slug -> descendants expansion lookup.
--    idx_nexus_qb_tags_parent already exists from 20260713180000.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_nexus_qb_tags_subject_slug
  ON nexus_qb_tags(slug)
  WHERE group_type = 'subject' AND is_active = true;
