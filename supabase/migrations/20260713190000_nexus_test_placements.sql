-- ============================================================
-- Nexus Unified Test Engine: Placements (Phase 2)
-- ------------------------------------------------------------
-- Makes a test a reusable, placeable asset:
--   * nexus_tests becomes context-agnostic (classroom_id nullable,
--     is_repository flag, created_from stamp for reversible migrations)
--   * nexus_test_placements records every context a test is used in,
--     with per-placement config (passing %, gating, ordering, visibility)
-- Additive + reversible. Existing classroom tests keep classroom_id + RLS.
-- ============================================================

-- 0. Placement context enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nexus_placement_context') THEN
    CREATE TYPE nexus_placement_context AS ENUM (
      'study_file',
      'classroom_assignment',
      'class_recap_section',
      'foundation_section',
      'module_item',
      'student_practice'
    );
  END IF;
END $$;

-- 1. nexus_tests: make it context-agnostic
ALTER TABLE nexus_tests ALTER COLUMN classroom_id DROP NOT NULL;
ALTER TABLE nexus_tests ADD COLUMN IF NOT EXISTS is_repository BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE nexus_tests ADD COLUMN IF NOT EXISTS created_from TEXT;  -- e.g. 'study_migration' (reversibility stamp)

CREATE INDEX IF NOT EXISTS idx_nexus_tests_repository ON nexus_tests(is_repository) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nexus_tests_created_from ON nexus_tests(created_from) WHERE created_from IS NOT NULL;

-- 2. Placements (polymorphic: context_id references vary by context_type, so no FK)
CREATE TABLE IF NOT EXISTS nexus_test_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES nexus_tests(id) ON DELETE CASCADE,
  context_type nexus_placement_context NOT NULL,
  context_id UUID NOT NULL,
  passing_pct INTEGER CHECK (passing_pct BETWEEN 1 AND 100),
  min_questions_to_pass INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  gating JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_placement_test_context UNIQUE (context_type, context_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_placements_context ON nexus_test_placements(context_type, context_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_placements_test ON nexus_test_placements(test_id) WHERE is_active = true;

-- Single-test contexts (study file, recap checkpoint, foundation section, module item)
-- may hold at most ONE active test. classroom_assignment + student_practice may hold many.
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_single_test
  ON nexus_test_placements(context_type, context_id)
  WHERE is_active = true
    AND context_type IN ('study_file', 'class_recap_section', 'foundation_section', 'module_item');

-- 3. RLS (service-role only, matching the QB/nexus_study_* pattern)
ALTER TABLE nexus_test_placements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_test_placements" ON nexus_test_placements;
CREATE POLICY "service_role_test_placements" ON nexus_test_placements FOR ALL TO service_role USING (true) WITH CHECK (true);
