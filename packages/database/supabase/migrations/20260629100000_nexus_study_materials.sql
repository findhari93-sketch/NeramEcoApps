-- Nexus Study Materials: a folder-based file manager (Windows-Explorer / Teams-Files style)
-- where teachers and admins organize exam resources (question papers, foundation books, drawing
-- references, counseling docs) for students to browse and view. The file bytes live in SharePoint
-- (reusing the existing uploadToSharePoint helper); these tables hold the folder hierarchy, the
-- SharePoint pointers, audience targeting, and per-folder/per-file download control.
--
-- Access is via the service-role admin client in the Nexus API routes, so RLS is enabled with no
-- policy (deny by default; the service role bypasses RLS). Student visibility (audience) and download
-- permission are enforced in the API layer, not in RLS.
--
-- Idempotent: safe to run more than once.

-- Folders: a self-referencing tree. parent_id NULL = a root folder.
CREATE TABLE IF NOT EXISTS nexus_study_folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       UUID REFERENCES nexus_study_folders(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  -- Audience targeting. An empty array means "visible to everyone".
  --   target_exams    matches nexus_classrooms.type ('nata' | 'jee' | 'revit' | 'other')
  --   target_programs matches users.student_program ('architecture' | 'software')
  target_exams    TEXT[] NOT NULL DEFAULT '{}',
  target_programs TEXT[] NOT NULL DEFAULT '{}',
  -- Folder-level download default. false = view-only (students open inline but cannot download).
  allow_download  BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  is_deleted      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_study_folders_parent
  ON nexus_study_folders(parent_id) WHERE is_deleted = false;

-- Files: each belongs to exactly one folder. The bytes live in SharePoint (sharepoint_item_id).
CREATE TABLE IF NOT EXISTS nexus_study_files (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id           UUID NOT NULL REFERENCES nexus_study_folders(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  file_type           TEXT,             -- MIME type, e.g. 'application/pdf', 'image/jpeg'
  file_size_bytes     BIGINT,
  page_count          INTEGER,
  sharepoint_item_id  TEXT,             -- Graph driveItem id (used to resolve download URL / delete)
  sharepoint_web_url  TEXT,             -- browser webUrl (staff convenience only, never given to students)
  storage_path        TEXT,             -- path within the SharePoint document library
  -- Per-file override of the folder's allow_download. NULL = inherit the folder.
  allow_download      BOOLEAN,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  uploaded_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  is_deleted          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_study_files_folder
  ON nexus_study_files(folder_id) WHERE is_deleted = false;

ALTER TABLE nexus_study_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_study_files   ENABLE ROW LEVEL SECURITY;
