-- Admin/teacher-uploaded documents under a student (alumni directory, Phase 2b).
--
-- Onboarding documents live in the Nexus document vault (SharePoint). This is a
-- lightweight, Supabase-backed store for documents an admin/teacher uploads from
-- the admin app (no SharePoint dependency), shown alongside the read-only Nexus
-- docs on the alumni profile. Files go to the existing public `documents` bucket.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS student_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT,
  category        TEXT,
  file_url        TEXT NOT NULL,
  file_path       TEXT,
  file_type       TEXT,
  file_size_bytes BIGINT,
  source          TEXT NOT NULL DEFAULT 'admin',
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_documents_user_id ON student_documents(user_id);

COMMENT ON TABLE student_documents IS 'Admin/teacher-uploaded documents under a student (Supabase documents bucket), shown with the read-only Nexus/SharePoint docs.';
