-- ============================================================
-- Fix QB Topic Hierarchy
-- Move top-level topics (History of Architecture, GK, Building Materials, etc.)
-- under Aptitude as sub-topics. In the correct hierarchy:
--   JEE Paper 2: Mathematics, Aptitude (with many sub-topics), Drawing
--   NATA: Drawing, Aptitude (with Math, GK, Puzzles, English Grammar, etc.)
-- ============================================================

-- Re-parent topics that should be children of Aptitude
UPDATE nexus_qb_topics
SET parent_id = (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'),
    sort_order = 5
WHERE slug = 'general-knowledge' AND parent_id IS NULL;

UPDATE nexus_qb_topics
SET parent_id = (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'),
    sort_order = 6
WHERE slug = 'history-of-architecture' AND parent_id IS NULL;

UPDATE nexus_qb_topics
SET parent_id = (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'),
    sort_order = 7
WHERE slug = 'building-materials' AND parent_id IS NULL;

UPDATE nexus_qb_topics
SET parent_id = (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'),
    sort_order = 8
WHERE slug = 'building-services' AND parent_id IS NULL;

UPDATE nexus_qb_topics
SET parent_id = (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'),
    sort_order = 9
WHERE slug = 'planning' AND parent_id IS NULL;

UPDATE nexus_qb_topics
SET parent_id = (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'),
    sort_order = 10
WHERE slug = 'sustainability' AND parent_id IS NULL;

UPDATE nexus_qb_topics
SET parent_id = (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'),
    sort_order = 11
WHERE slug = 'famous-architects' AND parent_id IS NULL;

-- The sub-topics of History of Architecture (ancient, medieval, etc.)
-- stay as children of History of Architecture — no change needed.
-- History of Architecture itself is now under Aptitude,
-- making these grandchildren of Aptitude.

-- Add missing NATA-specific sub-topics under Aptitude
INSERT INTO nexus_qb_topics (name, slug, parent_id, sort_order) VALUES
  ('English Grammar', 'aptitude-english-grammar', (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'), 12),
  ('Current Affairs', 'aptitude-current-affairs', (SELECT id FROM nexus_qb_topics WHERE slug = 'aptitude'), 13)
ON CONFLICT (slug) DO NOTHING;
