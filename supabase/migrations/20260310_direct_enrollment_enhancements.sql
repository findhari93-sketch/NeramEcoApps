-- ============================================
-- Direct Enrollment Enhancements: Link Regeneration
-- ============================================

-- Add regeneration tracking columns
ALTER TABLE direct_enrollment_links
  ADD COLUMN IF NOT EXISTS regenerated_from UUID REFERENCES direct_enrollment_links(id),
  ADD COLUMN IF NOT EXISTS regenerated_to UUID REFERENCES direct_enrollment_links(id);

-- Index for regeneration chain lookup
CREATE INDEX IF NOT EXISTS idx_direct_enrollment_links_regenerated_from
  ON direct_enrollment_links(regenerated_from)
  WHERE regenerated_from IS NOT NULL;

NOTIFY pgrst, 'reload schema';
