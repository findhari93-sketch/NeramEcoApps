-- ============================================================
-- Nexus tests: who deleted this, and when
-- ------------------------------------------------------------
-- Deleting a test has always been soft: `is_active = false`, so that the
-- ON DELETE CASCADE chain into nexus_test_attempts never fires and nobody's
-- score history is destroyed. That much was right. What it never recorded is
-- who pressed the button.
--
-- That gap stops being academic now that staff can clear the practice papers
-- students build for themselves, in bulk. Without these two columns:
--   * "my test disappeared" has no answer,
--   * and an accidental clear-out cannot be undone, because a test deactivated
--     a minute ago is indistinguishable from one that was never activated.
--
-- Both nullable, no backfill, no behaviour change. Rows deleted before this
-- migration simply carry NULL, which is the honest value: nothing was recorded.
-- ============================================================

ALTER TABLE nexus_tests
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  -- SET NULL rather than CASCADE: a staff member leaving must not take the
  -- deletion record with them, only the name attached to it.
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Partial, because the only question anyone asks of these columns is "what was
-- deleted recently", and live tests are the overwhelming majority of the table.
CREATE INDEX IF NOT EXISTS idx_nexus_tests_deleted_at
  ON nexus_tests(deleted_at DESC) WHERE is_active = false;
