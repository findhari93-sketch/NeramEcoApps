-- supabase/migrations/20260504_drawing_module_v2.sql
-- Drawing Module V2: Replace nexus_drawing_* with drawing_questions + drawing_submissions

-- ============================================================
-- 1. Drop old tables in FK dependency order
-- ============================================================
DROP TABLE IF EXISTS nexus_drawing_assignment_submissions CASCADE;
DROP TABLE IF EXISTS nexus_drawing_assignments CASCADE;
DROP TABLE IF EXISTS nexus_drawing_submissions CASCADE;
DROP TABLE IF EXISTS nexus_drawing_exercises CASCADE;
DROP TABLE IF EXISTS nexus_drawing_categories CASCADE;
DROP TABLE IF EXISTS nexus_drawing_levels CASCADE;

-- ============================================================
-- 2. Create drawing_questions
-- ============================================================
CREATE TABLE drawing_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  session_date DATE,
  source_student TEXT,
  category TEXT NOT NULL CHECK (category IN ('2d_composition', '3d_composition', 'kit_sculpture')),
  sub_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  objects TEXT[] DEFAULT '{}',
  color_constraint TEXT,
  design_principle TEXT,
  difficulty_tag TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty_tag IN ('easy', 'medium', 'hard')),
  reference_images JSONB DEFAULT '[]',
  solution_images JSONB,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dq_category ON drawing_questions(category);
CREATE INDEX idx_dq_year ON drawing_questions(year DESC);
CREATE INDEX idx_dq_tags ON drawing_questions USING GIN(tags);
CREATE INDEX idx_dq_difficulty ON drawing_questions(difficulty_tag);
CREATE INDEX idx_dq_sub_type ON drawing_questions(sub_type);
CREATE INDEX idx_dq_active ON drawing_questions(is_active) WHERE is_active = true;

-- ============================================================
-- 3. Create drawing_submissions
-- ============================================================
CREATE TABLE drawing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES drawing_questions(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('question_bank', 'homework', 'free_practice')),
  original_image_url TEXT NOT NULL,
  reviewed_image_url TEXT,
  self_note TEXT,
  ai_feedback JSONB,
  tutor_rating INTEGER CHECK (tutor_rating BETWEEN 1 AND 5),
  tutor_feedback TEXT,
  tutor_resources JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'reviewed', 'published')),
  is_gallery_published BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_ds_student ON drawing_submissions(student_id);
CREATE INDEX idx_ds_status ON drawing_submissions(status);
CREATE INDEX idx_ds_gallery ON drawing_submissions(is_gallery_published) WHERE is_gallery_published = true;
CREATE INDEX idx_ds_submitted ON drawing_submissions(submitted_at DESC);
CREATE INDEX idx_ds_question ON drawing_submissions(question_id);

-- ============================================================
-- 4. Enable RLS
-- ============================================================
ALTER TABLE drawing_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_submissions ENABLE ROW LEVEL SECURITY;

-- Questions: readable by all authenticated users
CREATE POLICY "Questions readable by authenticated" ON drawing_questions
  FOR SELECT TO authenticated USING (is_active = true);

-- Questions: full access for service role (admin operations)
CREATE POLICY "Service role full access questions" ON drawing_questions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Submissions: students read own
CREATE POLICY "Students read own submissions" ON drawing_submissions
  FOR SELECT TO authenticated USING (student_id = auth.uid());

-- Submissions: students insert own
CREATE POLICY "Students create submissions" ON drawing_submissions
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());

-- Submissions: gallery items readable by all
CREATE POLICY "Gallery readable by all" ON drawing_submissions
  FOR SELECT TO authenticated USING (is_gallery_published = true);

-- Submissions: full access for service role (teacher operations via admin client)
CREATE POLICY "Service role full access submissions" ON drawing_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5. Create storage buckets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('drawing-uploads', 'drawing-uploads', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('drawing-reviewed', 'drawing-reviewed', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('drawing-references', 'drawing-references', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload to drawing-uploads
CREATE POLICY "Authenticated upload drawings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'drawing-uploads');

CREATE POLICY "Users read own drawing uploads" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'drawing-uploads');

-- Storage policies: service role manages reviewed images
CREATE POLICY "Service role manage reviewed" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'drawing-reviewed') WITH CHECK (bucket_id = 'drawing-reviewed');

-- Storage policies: public read for references
CREATE POLICY "Public read references" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'drawing-references');

CREATE POLICY "Authenticated read references" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'drawing-references');

-- ============================================================
-- 6. Updated_at trigger
-- ============================================================
CREATE TRIGGER set_drawing_questions_updated_at
  BEFORE UPDATE ON drawing_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_nexus_updated_at();
