-- ============================================
-- FOUNDATION ISSUE ASSIGNMENT & ACTIVITY LOG
-- Adds assignment workflow, delegation, activity tracking,
-- and new notification event types for issues
-- ============================================

-- 1. ADD ASSIGNMENT COLUMNS TO nexus_foundation_issues
ALTER TABLE nexus_foundation_issues
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS idx_foundation_issues_assigned ON nexus_foundation_issues(assigned_to);

-- 2. ISSUE ACTIVITY LOG (tracks all status changes, assignments, delegations)
CREATE TABLE IF NOT EXISTS nexus_foundation_issue_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES nexus_foundation_issues(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN (
    'created',
    'assigned',
    'accepted',
    'delegated',
    'returned',
    'marked_in_progress',
    'resolved',
    'reopened',
    'comment'
  )),
  target_user_id UUID REFERENCES users(id),  -- who was assigned/delegated to
  reason TEXT,                                 -- delegation/return reason or comment
  old_status TEXT,
  new_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_issue_activity_issue ON nexus_foundation_issue_activity(issue_id);
CREATE INDEX idx_issue_activity_actor ON nexus_foundation_issue_activity(actor_id);

-- RLS
ALTER TABLE nexus_foundation_issue_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_issue_activity" ON nexus_foundation_issue_activity FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. NEW NOTIFICATION EVENT TYPES
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_reported';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_assigned';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_in_progress';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_delegated';
