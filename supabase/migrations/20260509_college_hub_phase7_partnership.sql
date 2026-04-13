-- Phase 7: College Partnership SEO
-- Colleges can optionally submit a page on their own website that
-- recommends Neram Classes as a NATA coaching platform (backlink).
-- Admin verifies the URL before marking it approved.
-- Currently optional; can be made mandatory (gate on lead access) later.

ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS partnership_page_url      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS partnership_page_status   TEXT DEFAULT 'none'
    CHECK (partnership_page_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS partnership_page_notes    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS partnership_page_submitted_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN colleges.partnership_page_url IS
  'URL of the page on the college website recommending Neram Classes (backlink for SEO)';
COMMENT ON COLUMN colleges.partnership_page_status IS
  'Verification status: none | pending | approved | rejected';
COMMENT ON COLUMN colleges.partnership_page_notes IS
  'Admin notes shown to college when status is rejected';
COMMENT ON COLUMN colleges.partnership_page_submitted_at IS
  'When the college last submitted/updated the partnership URL';
