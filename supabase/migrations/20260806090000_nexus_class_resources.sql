-- Class reference material.
--
-- A teacher often points students at something outside the class to make an idea
-- land: a YouTube explainer for a maths concept, a worked-example PDF, a photo of
-- a reference drawing. Until now that lived in speech or a Teams chat, so the one
-- student who most needed it, the one revising three weeks later or catching up on
-- a class they missed, could never find it.
--
-- This table is that list, attached to one scheduled class. It is optional, never
-- a gate, and never graded. Every enrolled student sees it the moment it is added.
--
-- Follows the nexus_class_images convention (20260724090000_class_capture.sql):
-- RLS enabled, service_role-only policy, all authorization in the API layer.
-- Idempotent.

-- 1. THE TABLE
CREATE TABLE IF NOT EXISTS nexus_class_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('youtube', 'link', 'image', 'study_file')),
  title TEXT NOT NULL,
  note TEXT,
  url TEXT,
  storage_path TEXT,
  study_file_id UUID REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  thumb_url TEXT,
  source_resource_id UUID REFERENCES nexus_class_resources(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shape rule: a PDF resource is a pointer into the study-file library and has no
-- url of its own; everything else is a url. Without this a row could claim to be
-- a video and carry neither a link nor a file, and the card would render blank.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_class_resources_shape_check'
      AND conrelid = 'nexus_class_resources'::regclass
  ) THEN
    ALTER TABLE nexus_class_resources
      ADD CONSTRAINT nexus_class_resources_shape_check
      CHECK (
        (kind = 'study_file' AND study_file_id IS NOT NULL)
        OR (kind IN ('youtube', 'link', 'image') AND url IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON TABLE nexus_class_resources IS
  'Optional teacher-curated reference material for one scheduled class: videos, links, images and PDFs. Visible to every enrolled student, never a gate.';
COMMENT ON COLUMN nexus_class_resources.note IS
  'The teacher''s reason for sharing, shown under the title to students. For example "watch 2:10 to 5:00 for the subtraction method".';
COMMENT ON COLUMN nexus_class_resources.url IS
  'Canonical YouTube watch URL, external web link, or the public Supabase URL of an uploaded image. NULL only for study_file rows.';
COMMENT ON COLUMN nexus_class_resources.storage_path IS
  'Supabase storage object path for uploaded images, so DELETE can remove the object. NULL for every other kind.';
COMMENT ON COLUMN nexus_class_resources.study_file_id IS
  'PDFs are stored through the study-materials pipeline so they render in the secure reader. Cascades: a deleted file must not leave a dead card.';
COMMENT ON COLUMN nexus_class_resources.source_resource_id IS
  'Set when this row was copied from another class via the reuse picker. SET NULL on delete because the copy must outlive its original.';

-- 2. INDEXES
-- Reads are always "everything on this class, in display order".
CREATE INDEX IF NOT EXISTS idx_class_resources_class
  ON nexus_class_resources(scheduled_class_id, sort_order);

-- Backs the reuse picker, which asks for a teacher's own recent resources.
-- Without this it would sequentially scan the whole table on every keystroke.
CREATE INDEX IF NOT EXISTS idx_class_resources_author
  ON nexus_class_resources(created_by, created_at DESC);

-- 3. UPDATED_AT
DROP TRIGGER IF EXISTS trg_nexus_class_resources_updated_at ON nexus_class_resources;
CREATE TRIGGER trg_nexus_class_resources_updated_at
  BEFORE UPDATE ON nexus_class_resources
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- 4. RLS
-- Service-role only; authorization happens in the API layer, matching every
-- other Nexus table.
ALTER TABLE nexus_class_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_class_resources" ON nexus_class_resources;
CREATE POLICY "service_role_full_access_class_resources"
  ON nexus_class_resources FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. SYSTEM STUDY FOLDER for reference PDFs.
--
-- Same shape as the assignment-attachments folder created in
-- 20260706000000_nexus_class_assignments.sql: hidden from the study-materials
-- browse tree (is_system), but its files are served by the existing view-only
-- content route because empty target_exams/target_programs means visible to every
-- authenticated student, and allow_download=false keeps it view-only.
--
-- A SECOND folder rather than reusing the assignment one, so class reference
-- material and assignment attachments stay separable: "what did we attach to
-- classes" is then one folder_id away.
INSERT INTO nexus_study_folders (id, name, description, is_system, allow_download)
VALUES ('a0000000-0000-4000-8000-000000000002',
        'Class reference material',
        'System folder for PDFs a teacher attaches to a scheduled class. Managed automatically.',
        true, false)
ON CONFLICT (id) DO NOTHING;
