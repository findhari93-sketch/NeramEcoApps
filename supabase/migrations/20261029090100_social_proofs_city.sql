-- City-tagged videos for the location pages (agents/seo-aeo/AUDIT_REPORT_2026-10.md, Phase D).
-- A class clip or review tagged with a city (the location-page slug, e.g.
-- 'madurai') shows on that city's coaching page with VideoObject markup and is
-- listed in the video sitemap. Untagged videos keep their current placements.

ALTER TABLE social_proofs
  ADD COLUMN IF NOT EXISTS city_slug text,
  ADD COLUMN IF NOT EXISTS center_id uuid REFERENCES offline_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_proofs_city_slug ON social_proofs (city_slug) WHERE city_slug IS NOT NULL;
