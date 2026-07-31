-- ============================================================
-- Nexus Test Library: folders
-- ------------------------------------------------------------
-- Tests were a flat, uncategorised pile. This gives them a home.
--
-- ONE table holds TWO trees, separated by owner_scope:
--   * 'staff'   -> the shared teacher library (owner_id IS NULL)
--   * 'student' -> one private tree per student (owner_id = users.id)
-- Keeping them in one table means the tree helpers, the breadcrumb
-- builder and the picker are written once, and a teacher browsing a
-- student's drilling folders reads the same rows the student wrote.
--
-- A test lives in exactly ONE folder. folder_id NULL means Unfiled,
-- which the hub surfaces as a real bucket rather than hiding.
-- Deleting a folder never deletes tests: ON DELETE SET NULL drops
-- them back to Unfiled.
-- Additive and reversible. Nothing existing changes behaviour.
-- ============================================================

-- 1. Folder tree
CREATE TABLE IF NOT EXISTS nexus_test_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES nexus_test_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Which tree this folder belongs to. Immutable in practice: moving a
  -- folder between trees would orphan its tests from their owner.
  owner_scope TEXT NOT NULL DEFAULT 'staff' CHECK (owner_scope IN ('staff', 'student')),
  -- NULL for the shared staff tree, the student's users.id for a private tree.
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A staff folder must not carry an owner, a student folder must.
  -- Without this a student folder with a NULL owner would be visible in
  -- the shared library, which is a privacy leak rather than a tidiness bug.
  CONSTRAINT chk_test_folder_owner CHECK (
    (owner_scope = 'staff' AND owner_id IS NULL)
    OR (owner_scope = 'student' AND owner_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_test_folders_parent
  ON nexus_test_folders(parent_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_test_folders_scope
  ON nexus_test_folders(owner_scope, owner_id) WHERE is_deleted = false;

-- Sibling names stay unique within a tree so "Foundation" cannot appear
-- twice under the same parent and leave the teacher guessing which is which.
-- Partial (live rows only) so a soft-deleted folder never blocks the name.
CREATE UNIQUE INDEX IF NOT EXISTS uq_test_folder_sibling_name
  ON nexus_test_folders(owner_scope, COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  WHERE is_deleted = false;

-- 2. File a test into a folder
ALTER TABLE nexus_tests
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES nexus_test_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_tests_folder
  ON nexus_tests(folder_id) WHERE is_active = true;

-- 3. RLS (service-role only, matching nexus_test_placements / nexus_qb_* )
ALTER TABLE nexus_test_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_test_folders" ON nexus_test_folders;
CREATE POLICY "service_role_test_folders" ON nexus_test_folders
  FOR ALL TO service_role USING (true) WITH CHECK (true);
