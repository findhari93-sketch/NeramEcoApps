-- Teacher Reference Library: study/practice images teachers upload for students
-- to learn from. Kept separate from student-work submissions (drawing_submissions).
-- Access is via the service-role admin client in the Nexus API routes, so RLS is
-- enabled with no policy (deny by default; service role bypasses RLS).

CREATE TABLE IF NOT EXISTS drawing_reference_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  category    TEXT,                              -- '2d_composition' | '3d_composition' | 'kit_sculpture'
  tags        TEXT[] NOT NULL DEFAULT '{}',      -- free-form e.g. {fruits, table-object}
  image_url   TEXT NOT NULL,
  notes       TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawing_reference_images_active
  ON drawing_reference_images(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_drawing_reference_images_category
  ON drawing_reference_images(category);

ALTER TABLE drawing_reference_images ENABLE ROW LEVEL SECURITY;
