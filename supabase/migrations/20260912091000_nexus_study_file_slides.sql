-- Nexus Study Materials: a PowerPoint deck beside a chapter PDF ("Slides").
--
-- Classes are taught from PowerPoint now, and students want to study from the
-- deck as well as from the chapter PDF. A chapter holds at most one deck. The
-- deck itself stays in the Neram SharePoint library. Nexus converts it to PDF
-- through Microsoft Graph (content?format=pdf) and keeps that PDF in the private
-- study-slides bucket, so students read pages in the secure pdf.js reader, with
-- their watermark, and never receive the .pptx.
--
-- source_ctag is SharePoint's content tag for the version pdf_path was converted
-- from. It changes only when the file's content changes, so comparing it on open
-- is how an edited deck reaches students without a teacher attaching it again.
-- checked_at throttles that comparison to one Graph call per chapter per window.
--
-- problem records why the last refresh failed. The last good PDF keeps being
-- served, so a deck moved or broken in SharePoint does not blank a chapter.
--
-- Access is via the service-role admin client in the Nexus API routes. RLS is
-- enabled with a service_role policy, matching the sibling nexus tables.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS nexus_study_file_slides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id             UUID NOT NULL UNIQUE REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  drive_id            TEXT NOT NULL,
  item_id             TEXT NOT NULL,
  source_name         TEXT NOT NULL,
  source_web_url      TEXT,
  source_ctag         TEXT,
  source_modified_at  TIMESTAMPTZ,
  pdf_path            TEXT,
  pdf_size_bytes      BIGINT,
  converted_at        TIMESTAMPTZ,
  checked_at          TIMESTAMPTZ,
  problem             TEXT CHECK (
    problem IN ('SOURCE_MISSING', 'NO_ACCESS', 'RENDITION_UNAVAILABLE', 'TOO_LARGE', 'GRAPH_UNAVAILABLE')
  ),
  attached_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE nexus_study_file_slides ENABLE ROW LEVEL SECURITY;
-- Idempotent: CREATE POLICY has no IF NOT EXISTS, so without the drop this
-- migration can only ever run once and a re-push fails on "policy already exists".
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_study_file_slides;
CREATE POLICY "service_role_full_access" ON nexus_study_file_slides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Private: every read is a signed URL minted by the slides route after the
-- audience and download checks. 50 MB matches the largest PDF the route keeps.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('study-slides', 'study-slides', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
