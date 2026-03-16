-- ============================================
-- Modular Content Management System
-- Modules → Checklists → Classrooms
--
-- New tables:
--   nexus_modules, nexus_module_items,
--   nexus_checklists, nexus_checklist_entries,
--   nexus_checklist_entry_resources,
--   nexus_checklist_classrooms,
--   nexus_student_entry_progress,
--   nexus_student_module_item_progress
--
-- Data migration:
--   Existing nexus_checklist_items → nexus_checklist_entries
--   Existing nexus_checklist_resources → nexus_checklist_entry_resources
--   Existing nexus_student_checklist_progress → nexus_student_entry_progress
-- ============================================

-- ============================================
-- 1. MODULES — Standalone reusable content containers
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder',
  color TEXT DEFAULT '#546E7A',
  module_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (module_type IN ('foundation', 'custom')),
  is_published BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_modules_type ON nexus_modules(module_type);
CREATE INDEX IF NOT EXISTS idx_nexus_modules_published ON nexus_modules(is_published);

-- ============================================
-- 2. MODULE ITEMS — Child elements within a module
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_module_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES nexus_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  item_type TEXT NOT NULL DEFAULT 'link'
    CHECK (item_type IN ('video', 'document', 'quiz_paper', 'link', 'chapter')),
  content_url TEXT,
  youtube_video_id TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_module_items_module ON nexus_module_items(module_id);
CREATE INDEX IF NOT EXISTS idx_nexus_module_items_sort ON nexus_module_items(module_id, sort_order);

-- ============================================
-- 3. CHECKLISTS — Named containers that group modules + simple items
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. CHECKLIST ENTRIES — Polymorphic: either a module ref or a simple item
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_checklist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES nexus_checklists(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('module', 'simple_item')),
  -- When entry_type = 'module':
  module_id UUID REFERENCES nexus_modules(id) ON DELETE SET NULL,
  -- When entry_type = 'simple_item':
  title TEXT,
  description TEXT,
  learning_outcome TEXT,
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  -- Common:
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Constraint: module_id required for modules, title required for simple items
  CONSTRAINT check_entry_type_fields CHECK (
    (entry_type = 'module' AND module_id IS NOT NULL) OR
    (entry_type = 'simple_item' AND title IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_nexus_checklist_entries_checklist ON nexus_checklist_entries(checklist_id);
CREATE INDEX IF NOT EXISTS idx_nexus_checklist_entries_module ON nexus_checklist_entries(module_id);
CREATE INDEX IF NOT EXISTS idx_nexus_checklist_entries_sort ON nexus_checklist_entries(checklist_id, sort_order);

-- ============================================
-- 5. CHECKLIST ENTRY RESOURCES — For simple item entries
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_checklist_entry_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES nexus_checklist_entries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  resource_type TEXT CHECK (resource_type IN ('pdf', 'image', 'youtube', 'onenote', 'link')),
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_entry_resources_entry ON nexus_checklist_entry_resources(entry_id);

-- ============================================
-- 6. CHECKLIST ↔ CLASSROOM — Many-to-many assignment
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_checklist_classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES nexus_checklists(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(checklist_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_checklist_classrooms_classroom ON nexus_checklist_classrooms(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_checklist_classrooms_checklist ON nexus_checklist_classrooms(checklist_id);

-- ============================================
-- 7. STUDENT PROGRESS — Simple entry completion
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_student_entry_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES nexus_checklist_entries(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(student_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_student_entry_progress_student ON nexus_student_entry_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_entry_progress_entry ON nexus_student_entry_progress(entry_id);

-- ============================================
-- 8. STUDENT PROGRESS — Module item completion
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_student_module_item_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_item_id UUID NOT NULL REFERENCES nexus_module_items(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(student_id, module_item_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_student_module_item_progress_student ON nexus_student_module_item_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_module_item_progress_item ON nexus_student_module_item_progress(module_item_id);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE TRIGGER nexus_modules_updated_at
  BEFORE UPDATE ON nexus_modules
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

CREATE TRIGGER nexus_module_items_updated_at
  BEFORE UPDATE ON nexus_module_items
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

CREATE TRIGGER nexus_checklists_updated_at
  BEFORE UPDATE ON nexus_checklists
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_module_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_checklist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_checklist_entry_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_checklist_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_entry_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_module_item_progress ENABLE ROW LEVEL SECURITY;

-- Service role full access (used by API routes via getSupabaseAdminClient)
CREATE POLICY "service_role_full_access" ON nexus_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_module_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_checklists FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_checklist_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_checklist_entry_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_checklist_classrooms FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_student_entry_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_student_module_item_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- SEED: Foundation Module
-- ============================================

INSERT INTO nexus_modules (title, description, icon, color, module_type, is_published)
VALUES (
  'Foundation Module',
  'Core architecture aptitude chapters with video lessons, section quizzes, and progress tracking.',
  'menu_book',
  '#1976D2',
  'foundation',
  true
);

-- ============================================
-- DATA MIGRATION: Existing checklist items → new structure
-- ============================================

-- Step 1: Create a default checklist per classroom that has existing items
INSERT INTO nexus_checklists (id, title, description, created_by, created_at)
SELECT
  gen_random_uuid(),
  c.name || ' Checklist',
  'Auto-migrated checklist from existing items',
  c.created_by,
  now()
FROM nexus_classrooms c
WHERE c.id IN (SELECT DISTINCT classroom_id FROM nexus_checklist_items WHERE is_active = true)
  AND c.is_active = true;

-- Step 2: Link each auto-created checklist to its classroom
-- We need to map classroom → checklist. Use a temp table for the mapping.
DO $$
DECLARE
  classroom_rec RECORD;
  item_rec RECORD;
  new_checklist_id UUID;
  new_entry_id UUID;
  v_classroom_id UUID;
BEGIN
  -- For each classroom with existing checklist items
  FOR classroom_rec IN
    SELECT DISTINCT ci.classroom_id, c.name AS classroom_name, c.created_by
    FROM nexus_checklist_items ci
    JOIN nexus_classrooms c ON c.id = ci.classroom_id
    WHERE ci.is_active = true AND c.is_active = true
  LOOP
    v_classroom_id := classroom_rec.classroom_id;

    -- Find the checklist we just created for this classroom
    SELECT cl.id INTO new_checklist_id
    FROM nexus_checklists cl
    WHERE cl.title = classroom_rec.classroom_name || ' Checklist'
      AND cl.description = 'Auto-migrated checklist from existing items'
    ORDER BY cl.created_at DESC
    LIMIT 1;

    IF new_checklist_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Link checklist to classroom
    INSERT INTO nexus_checklist_classrooms (checklist_id, classroom_id, assigned_by)
    VALUES (new_checklist_id, v_classroom_id, classroom_rec.created_by)
    ON CONFLICT (checklist_id, classroom_id) DO NOTHING;

    -- Migrate checklist items as simple_item entries
    FOR item_rec IN
      SELECT ci.id AS old_id, ci.title, ci.description, ci.learning_outcome,
             ci.topic_id, ci.sort_order
      FROM nexus_checklist_items ci
      WHERE ci.classroom_id = v_classroom_id AND ci.is_active = true
      ORDER BY ci.sort_order
    LOOP
      new_entry_id := gen_random_uuid();

      INSERT INTO nexus_checklist_entries (id, checklist_id, entry_type, title, description, learning_outcome, topic_id, sort_order)
      VALUES (new_entry_id, new_checklist_id, 'simple_item', item_rec.title, item_rec.description, item_rec.learning_outcome, item_rec.topic_id, item_rec.sort_order);

      -- Migrate resources for this item
      INSERT INTO nexus_checklist_entry_resources (entry_id, title, resource_type, url, sort_order, created_at)
      SELECT new_entry_id, cr.title, cr.resource_type, cr.url, cr.sort_order, cr.created_at
      FROM nexus_checklist_resources cr
      WHERE cr.checklist_item_id = item_rec.old_id;

      -- Migrate student progress for this item
      INSERT INTO nexus_student_entry_progress (student_id, entry_id, is_completed, completed_at)
      SELECT sp.student_id, new_entry_id, sp.is_completed, sp.completed_at
      FROM nexus_student_checklist_progress sp
      WHERE sp.checklist_item_id = item_rec.old_id;
    END LOOP;
  END LOOP;
END$$;
