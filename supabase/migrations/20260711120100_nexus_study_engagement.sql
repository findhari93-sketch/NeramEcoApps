-- Nexus Study Materials: lightweight per-student engagement.
--   * nexus_study_file_reads     — which files a student has opened (drives "unread" badges)
--   * nexus_study_file_favorites — files a student starred (drives the "Starred" quick-access view)
--
-- Both are (user, file) tuples written from the API layer via the service-role client, so RLS is
-- enabled with no policy (deny by default). ON DELETE CASCADE keeps them clean if a user or file row
-- is hard-deleted (study files are normally soft-deleted, so list queries still join is_deleted=false).
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS nexus_study_file_reads (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id   UUID NOT NULL REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, file_id)
);

-- Batch "which of these files has this user read" lookups on browse.
CREATE INDEX IF NOT EXISTS idx_nexus_study_reads_user ON nexus_study_file_reads(user_id);

CREATE TABLE IF NOT EXISTS nexus_study_file_favorites (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id    UUID NOT NULL REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_study_favorites_user ON nexus_study_file_favorites(user_id);

ALTER TABLE nexus_study_file_reads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_study_file_favorites ENABLE ROW LEVEL SECURITY;
