-- Time-limited, per-student download grants for Study Materials.
--
-- By default students cannot download study-material files (view-only). A teacher/admin can grant a
-- specific student a temporary download window (e.g. for a printout), scoped to a single file, a
-- whole folder, or all materials, expiring after a set time. Enforced at the download proxy
-- (apps/nexus/src/app/api/study-materials/files/[id]/content/route.ts).
--
-- RLS is enabled with NO policies (deny-by-default): all access is via the service-role admin client
-- with checks in the API layer, matching the other nexus_study_* tables.

CREATE TABLE IF NOT EXISTS nexus_study_download_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL CHECK (scope IN ('file', 'folder', 'all')),
  file_id     UUID REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  folder_id   UUID REFERENCES nexus_study_folders(id) ON DELETE CASCADE,
  granted_by  UUID NOT NULL REFERENCES users(id),
  reason      TEXT,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  revoked_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The target must match the scope: file scope needs a file, folder scope needs a folder.
  CONSTRAINT nexus_study_download_grants_scope_target_ck CHECK (
    (scope = 'file'   AND file_id   IS NOT NULL) OR
    (scope = 'folder' AND folder_id IS NOT NULL) OR
    (scope = 'all')
  )
);

-- Active-grant lookups per student (the hot path at the download proxy + DTO builders).
CREATE INDEX IF NOT EXISTS idx_nexus_study_dl_grants_student_active
  ON nexus_study_download_grants (student_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nexus_study_dl_grants_file
  ON nexus_study_download_grants (file_id);
CREATE INDEX IF NOT EXISTS idx_nexus_study_dl_grants_folder
  ON nexus_study_download_grants (folder_id);
CREATE INDEX IF NOT EXISTS idx_nexus_study_dl_grants_expires
  ON nexus_study_download_grants (expires_at);

ALTER TABLE nexus_study_download_grants ENABLE ROW LEVEL SECURITY;
