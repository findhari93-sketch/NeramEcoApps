-- ============================================
-- Social Proofs (audio, video, screenshot testimonials)
-- Separate from text-based testimonials table
-- ============================================

-- Social proof media types
CREATE TYPE social_proof_type AS ENUM ('video', 'audio', 'screenshot');

-- Language tags for social proofs
CREATE TYPE social_proof_language AS ENUM ('tamil', 'english', 'hindi', 'kannada', 'malayalam', 'telugu');

CREATE TABLE social_proofs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Type discriminator
  proof_type social_proof_type NOT NULL,

  -- Video fields
  youtube_url TEXT,
  youtube_id TEXT,

  -- Audio fields
  audio_url TEXT,
  audio_duration INTEGER,

  -- Screenshot fields
  image_url TEXT,

  -- People
  speaker_name TEXT NOT NULL,
  student_name TEXT,
  parent_photo TEXT,

  -- Context
  batch TEXT,
  language social_proof_language NOT NULL DEFAULT 'tamil',
  description JSONB NOT NULL DEFAULT '{}',
  caption TEXT,

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
CREATE INDEX idx_social_proofs_active_type
  ON social_proofs (proof_type, is_active, display_order)
  WHERE is_active = true;

CREATE INDEX idx_social_proofs_homepage
  ON social_proofs (is_homepage, is_active, proof_type, display_order)
  WHERE is_homepage = true AND is_active = true;

CREATE INDEX idx_social_proofs_language
  ON social_proofs (language, is_active)
  WHERE is_active = true;

-- RLS
ALTER TABLE social_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active social proofs"
  ON social_proofs FOR SELECT
  USING (is_active = true);

-- Auto-update updated_at (reuses existing trigger function)
CREATE TRIGGER set_social_proofs_updated_at
  BEFORE UPDATE ON social_proofs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Storage bucket for audio files and screenshot images
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-proofs', 'social-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on the storage bucket
CREATE POLICY "Public read social-proofs bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-proofs');

-- Allow service role to upload
CREATE POLICY "Service role upload social-proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'social-proofs');

CREATE POLICY "Service role update social-proofs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'social-proofs');

CREATE POLICY "Service role delete social-proofs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'social-proofs');
