-- Testimonials table for student success stories
-- Managed from admin panel, displayed on marketing site

CREATE TYPE testimonial_learning_mode AS ENUM ('online', 'hybrid', 'offline');

CREATE TABLE testimonials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Student info
  student_name TEXT NOT NULL,
  student_photo TEXT,

  -- Content (multilingual JSONB: { "en": "...", "ta": "..." })
  content JSONB NOT NULL DEFAULT '{}',

  -- Exam results
  exam_type exam_type NOT NULL,
  score INTEGER,
  rank INTEGER,
  college_admitted TEXT,
  year INTEGER NOT NULL,

  -- Filtering dimensions
  course_name TEXT NOT NULL,
  course_slug TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Tamil Nadu',
  learning_mode testimonial_learning_mode NOT NULL DEFAULT 'offline',

  -- Enhanced content
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  video_url TEXT,

  -- Display controls
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_homepage BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_testimonials_active ON testimonials (is_active, year DESC, display_order);
CREATE INDEX idx_testimonials_homepage ON testimonials (is_homepage, is_active, display_order)
  WHERE is_homepage = true AND is_active = true;
CREATE INDEX idx_testimonials_city ON testimonials (city, is_active)
  WHERE is_active = true;
CREATE INDEX idx_testimonials_course ON testimonials (course_name, is_active)
  WHERE is_active = true;
CREATE INDEX idx_testimonials_mode ON testimonials (learning_mode, is_active)
  WHERE is_active = true;

-- RLS: public can read active testimonials, service role can do everything
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active testimonials"
  ON testimonials FOR SELECT
  USING (is_active = true);

-- Auto-update updated_at
CREATE TRIGGER set_testimonials_updated_at
  BEFORE UPDATE ON testimonials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
