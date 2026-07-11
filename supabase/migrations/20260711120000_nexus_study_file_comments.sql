-- Nexus Study Materials: per-file comments (Google Classroom style).
-- Students can post a public "Class" comment (seen by everyone in the file's audience + teachers)
-- or a private comment (seen only by that student and teachers). Teachers reply into either stream
-- and can mark a private/reported thread resolved, or soft-delete any comment for moderation.
--
-- Thread identity is the tuple (file_id, visibility, thread_student_id):
--   * public class comment : visibility='public',  thread_student_id NULL, any author
--   * student private root  : visibility='private', author_id=S, thread_student_id=S
--   * teacher private reply : visibility='private', author_id=T, thread_student_id=S (the student)
--
-- Access is via the service-role admin client in the Nexus API routes, so RLS is enabled with no
-- policy (deny by default; the service role bypasses RLS). Audience + visibility are enforced in the
-- API layer, matching the nexus_study_folders/files convention.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS nexus_study_file_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id           UUID NOT NULL REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES users(id),
  author_role       TEXT NOT NULL CHECK (author_role IN ('student','teacher')),
  visibility        TEXT NOT NULL CHECK (visibility IN ('public','private')),
  -- Owner of a private thread. NULL for public class comments.
  thread_student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  -- Reserved for optional 1-level reply nesting; v1 renders flat.
  parent_comment_id UUID REFERENCES nexus_study_file_comments(id) ON DELETE CASCADE,
  -- Lightweight review: teachers can mark a student thread resolved.
  is_resolved       BOOLEAN NOT NULL DEFAULT false,
  resolved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,
  -- Teacher moderation = soft delete (hides from students).
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Invariant: a private comment always names its thread owner; a public one never does.
  CONSTRAINT chk_study_comment_thread CHECK (
    (visibility = 'public'  AND thread_student_id IS NULL) OR
    (visibility = 'private' AND thread_student_id IS NOT NULL)
  )
);

-- Thread load: private thread by (file, student) and public stream by file.
CREATE INDEX IF NOT EXISTS idx_nexus_study_comments_thread
  ON nexus_study_file_comments(file_id, visibility, thread_student_id) WHERE is_deleted = false;

-- Feedback inbox: unresolved comments, kept tiny by a partial index.
CREATE INDEX IF NOT EXISTS idx_nexus_study_comments_open
  ON nexus_study_file_comments(file_id) WHERE is_deleted = false AND is_resolved = false;

ALTER TABLE nexus_study_file_comments ENABLE ROW LEVEL SECURITY;
