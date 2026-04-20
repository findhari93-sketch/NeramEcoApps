-- Drawing tags + unified gallery visibility
--
-- 1. Introduce a flexible many-to-many tag system for submissions,
--    seeded from the existing question category enum.
-- 2. Rename is_gallery_published -> is_gallery_visible. Visibility is now
--    independent of status; a submission is shown in the gallery when it
--    has a rating + feedback and the flag is on.
-- 3. Drop the 'published' status value; gallery visibility is now a boolean,
--    and status is only the review lifecycle. Existing 'published' rows are
--    normalised to 'completed' with visibility preserved.
-- 4. Backfill: every historical submission that has a rating + feedback
--    becomes visible by default so the learning gallery includes past work,
--    including items previously marked 'redo'.

-- ============================================================
-- 1. Tags tables
-- ============================================================
CREATE TABLE drawing_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  is_seed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drawing_tags_slug ON drawing_tags(slug);

CREATE TABLE drawing_submission_tags (
  submission_id UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES drawing_tags(id) ON DELETE RESTRICT,
  PRIMARY KEY (submission_id, tag_id)
);

CREATE INDEX idx_drawing_submission_tags_tag ON drawing_submission_tags(tag_id);

-- RLS: tags are readable by all authenticated users.
-- Writes go through the service role (teacher API routes use the admin client).
ALTER TABLE drawing_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_submission_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tags readable by authenticated" ON drawing_tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access drawing_tags" ON drawing_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Submission tags readable by authenticated" ON drawing_submission_tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access drawing_submission_tags" ON drawing_submission_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Seed tags
-- ============================================================
INSERT INTO drawing_tags (slug, label, is_seed) VALUES
  ('2d-composition', '2D Composition', true),
  ('3d-composition', '3D Composition', true),
  ('kit-sculpture',  'Kit / Sculpture', true),
  ('scenery',        'Scenery',         true),
  ('street-view',    'Street View',     true),
  ('still-life',     'Still Life',      true),
  ('perspective',    'Perspective',     true),
  ('portrait',       'Portrait',        true),
  ('figure-study',   'Figure Study',    true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 3. Backfill submission tags from drawing_questions.category
-- ============================================================
INSERT INTO drawing_submission_tags (submission_id, tag_id)
SELECT s.id, t.id
  FROM drawing_submissions s
  JOIN drawing_questions q ON q.id = s.question_id
  JOIN drawing_tags t
    ON t.slug = CASE q.category
                  WHEN '2d_composition' THEN '2d-composition'
                  WHEN '3d_composition' THEN '3d-composition'
                  WHEN 'kit_sculpture'  THEN 'kit-sculpture'
                END
 WHERE q.category IS NOT NULL
ON CONFLICT (submission_id, tag_id) DO NOTHING;

-- ============================================================
-- 4. Rename is_gallery_published -> is_gallery_visible
-- ============================================================
-- Drop the old partial index that referenced the renamed column before renaming.
DROP INDEX IF EXISTS idx_ds_gallery;

ALTER TABLE drawing_submissions
  RENAME COLUMN is_gallery_published TO is_gallery_visible;

-- New partial index using the new name.
CREATE INDEX idx_ds_gallery_visible
  ON drawing_submissions(is_gallery_visible)
  WHERE is_gallery_visible = true;

-- ============================================================
-- 5. Normalise status: 'published' -> 'completed' (keep visibility flag)
-- ============================================================
UPDATE drawing_submissions
   SET status = 'completed'
 WHERE status = 'published';

-- Drop and recreate the CHECK constraint without 'published'.
ALTER TABLE drawing_submissions DROP CONSTRAINT drawing_submissions_status_check;
ALTER TABLE drawing_submissions ADD CONSTRAINT drawing_submissions_status_check
  CHECK (status IN ('submitted', 'under_review', 'redo', 'completed', 'reviewed'));

-- ============================================================
-- 6. Backfill historical visibility
-- ============================================================
-- Every submission that carries real learning value (rating + feedback)
-- becomes visible in the unified gallery by default. Teachers can flip
-- individual items off via the new "Show in Gallery" toggle.
UPDATE drawing_submissions
   SET is_gallery_visible = true
 WHERE tutor_rating   IS NOT NULL
   AND tutor_feedback IS NOT NULL
   AND status IN ('reviewed', 'redo', 'completed');

-- ============================================================
-- 7. RLS policy update: gallery readable policy now uses the new flag name
-- ============================================================
DROP POLICY IF EXISTS "Gallery readable by all" ON drawing_submissions;
CREATE POLICY "Gallery readable by all" ON drawing_submissions
  FOR SELECT TO authenticated USING (is_gallery_visible = true);
