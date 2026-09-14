-- Who has already been congratulated for being all clear on catch-up.
--
-- The Standing tab's Teams post named every all-clear student on every press
-- and remembered nothing, so a teacher could not tell who had already been
-- congratulated and ended up naming the same students again and again.
--
-- One row per student per congratulation, kept as history. `source` says how:
-- 'teams' is a real post (its message ids are kept), 'marked' is a teacher
-- recording one that happened outside Nexus. Only 'marked' rows may be deleted,
-- because a Teams message cannot be unsent by removing its record.
--
-- `cleared_total` and `last_cleared_at` snapshot the student's standing at the
-- time. A student whose latest clear is newer than the snapshot has cleared
-- another class since, and is due a new congratulation.

CREATE TABLE IF NOT EXISTS nexus_catchup_celebrations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id                UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  student_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  celebrated_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  source                      TEXT NOT NULL CHECK (source IN ('teams', 'marked')),
  cleared_total               INT NOT NULL DEFAULT 0,
  last_cleared_at             TIMESTAMPTZ,
  teams_channel_message_id    TEXT,
  teams_group_chat_message_id TEXT,
  celebrated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catchup_celebrations_student
  ON nexus_catchup_celebrations(classroom_id, student_id, celebrated_at DESC);

-- Service role only, like the rest of the Nexus teacher surface. MSAL means
-- auth.uid() is always null here, so a policy would be dead code.
ALTER TABLE nexus_catchup_celebrations ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
