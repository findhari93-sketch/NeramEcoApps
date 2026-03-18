-- Teams Integration v2: Add team name cache, sync toggle, and sync log

-- Cache Teams team name for UI display (avoids Graph API calls)
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS ms_team_name TEXT;

-- Whether auto-sync is enabled for this classroom
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS ms_team_sync_enabled BOOLEAN DEFAULT false;

-- Sync log for tracking Teams operations
CREATE TABLE IF NOT EXISTS nexus_teams_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,  -- 'add_member', 'remove_member', 'create_team', 'link_team', 'sync'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'success', 'failed', 'pending'
  details JSONB,  -- additional context (e.g. members added/skipped counts)
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying sync logs by classroom
CREATE INDEX IF NOT EXISTS idx_nexus_teams_sync_log_classroom
  ON nexus_teams_sync_log(classroom_id, created_at DESC);

-- RLS policies for sync log
ALTER TABLE nexus_teams_sync_log ENABLE ROW LEVEL SECURITY;

-- Teachers can view sync logs for their classrooms
CREATE POLICY "Teachers can view sync logs"
  ON nexus_teams_sync_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_teams_sync_log.classroom_id
        AND nexus_enrollments.user_id = auth.uid()
        AND nexus_enrollments.role = 'teacher'
    )
  );

-- Service role can insert/update (API routes use admin client)
CREATE POLICY "Service role full access on sync log"
  ON nexus_teams_sync_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
