-- Art Gallery Reactions + Drawing Homework

-- ============================================================
-- 1. Gallery Reactions
-- ============================================================
CREATE TABLE drawing_gallery_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('heart', 'clap', 'fire', 'star', 'wow')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(submission_id, user_id, reaction_type)
);

CREATE INDEX idx_dgr_submission ON drawing_gallery_reactions(submission_id);
CREATE INDEX idx_dgr_user ON drawing_gallery_reactions(user_id);

ALTER TABLE drawing_gallery_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions readable by all" ON drawing_gallery_reactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users create own reactions" ON drawing_gallery_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own reactions" ON drawing_gallery_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Service role full access reactions" ON drawing_gallery_reactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Drawing Homework
-- ============================================================
CREATE TABLE drawing_homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  question_ids UUID[] DEFAULT '{}',
  reference_images JSONB DEFAULT '[]',
  assigned_to TEXT NOT NULL CHECK (assigned_to IN ('all_students', 'specific_students')),
  student_ids UUID[] DEFAULT '{}',
  due_date TIMESTAMPTZ NOT NULL,
  is_mandatory BOOLEAN DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  classroom_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dhw_due ON drawing_homework(due_date);
CREATE INDEX idx_dhw_classroom ON drawing_homework(classroom_id);
CREATE INDEX idx_dhw_created_by ON drawing_homework(created_by);

ALTER TABLE drawing_homework ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homework readable by all authenticated" ON drawing_homework
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access homework" ON drawing_homework
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Add homework_id to drawing_submissions
-- ============================================================
ALTER TABLE drawing_submissions ADD COLUMN homework_id UUID REFERENCES drawing_homework(id) ON DELETE SET NULL;
CREATE INDEX idx_ds_homework ON drawing_submissions(homework_id) WHERE homework_id IS NOT NULL;
