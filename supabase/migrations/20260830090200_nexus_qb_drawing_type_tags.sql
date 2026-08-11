-- Drawing sub-types, as tags under the existing "drawing" subject tag.
--
-- Nothing like "logo design" or "street view" exists anywhere in the schema
-- today. The three families (2D composition, 3D composition, kit sculpture)
-- already exist as flat subject tags, siblings of "drawing" rather than
-- children of it, seeded in 20260801080000. This migration re-parents them
-- and adds their leaves.
--
-- The families stay QBCategory members (packages/database/src/types/index.ts),
-- so they remain settable as Classification chips: a question tagged only
-- "2D Composition" is legitimately "a 2D composition, type unspecified". The
-- leaves below are deliberately NOT added to QBCategory. types/index.ts warns
-- against a parent slug that cannot be chipped becoming a silent orphan on a
-- tagged question; these parents can still be chipped directly, so the rule
-- holds.
--
-- Teacher-extendable: every leaf here is is_system = false, so a teacher can
-- rename or hide one from Tag management, or add a sibling from the paper
-- workspace's tag dialog, same as any other theme tag.

-- 1. Re-parent the three existing families under "drawing".
UPDATE nexus_qb_tags c
SET parent_id = p.id, updated_at = now()
FROM nexus_qb_tags p
WHERE p.slug = 'drawing' AND p.group_type = 'subject'
  AND c.slug IN ('2d_composition', '3d_composition', 'kit_sculpture')
  AND c.group_type = 'subject'
  AND c.parent_id IS DISTINCT FROM p.id;

-- 2. The leaves. Inserted via a join so each leaf's parent_id is looked up by
--    slug rather than hardcoded, and the whole block is safe to run again.
CREATE TEMP TABLE _qb_drawing_leaf(parent_slug text, slug text, label text, sort_order int)
  ON COMMIT DROP;

INSERT INTO _qb_drawing_leaf(parent_slug, slug, label, sort_order) VALUES
  ('2d_composition', 'shape_composition',       'Shape Composition',       1),
  ('2d_composition', 'logo_design',              'Logo Design',             2),
  ('2d_composition', 'poster_design',            'Poster Design',           3),
  ('2d_composition', 'pattern_motif',            'Pattern / Motif',         4),
  ('2d_composition', 'colour_composition',       'Colour Composition',      5),
  ('2d_composition', 'typography_composition',   'Typography Composition',  6),
  ('3d_composition', 'street_view',              'Street View',             1),
  ('3d_composition', 'interior_view',            'Interior View',           2),
  ('3d_composition', 'building_exterior',        'Building Exterior',       3),
  ('3d_composition', 'portrait_figure',          'Portrait / Figure',       4),
  ('3d_composition', 'still_life',               'Still Life',              5),
  ('3d_composition', 'product_object',           'Product / Object',        6),
  ('3d_composition', 'perspective_drawing',      'Perspective Drawing',     7),
  ('kit_sculpture',  'given_kit_assembly',       'Given Kit Assembly',      1),
  ('kit_sculpture',  'free_form_sculpture',      'Free-form Sculpture',     2);

INSERT INTO nexus_qb_tags (group_type, slug, label, parent_id, is_system, sort_order)
SELECT 'subject', l.slug, l.label, p.id, false, l.sort_order
FROM _qb_drawing_leaf l
JOIN nexus_qb_tags p ON p.slug = l.parent_slug AND p.group_type = 'subject'
ON CONFLICT (slug) DO NOTHING;

-- 3. A fourth family with no further breakdown of its own: a drawing done
--    from memory rather than from a given prompt or kit. Sits directly under
--    "drawing", a sibling of the three families above.
INSERT INTO nexus_qb_tags (group_type, slug, label, parent_id, is_system, sort_order)
SELECT 'subject', 'memory_drawing', 'Memory Drawing', p.id, false, 24
FROM nexus_qb_tags p
WHERE p.slug = 'drawing' AND p.group_type = 'subject'
ON CONFLICT (slug) DO NOTHING;
