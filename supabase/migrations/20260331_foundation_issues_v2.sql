-- ============================================
-- FOUNDATION ISSUES V2 — Enterprise Ticket System
-- Adds: ticket numbers, categories, screenshots,
-- confirmation workflow, standalone tickets
-- ============================================

-- 1. ADD NEW COLUMNS
ALTER TABLE nexus_foundation_issues
  ADD COLUMN IF NOT EXISTS ticket_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug', 'content_issue', 'ui_ux', 'feature_request', 'class_schedule', 'other')),
  ADD COLUMN IF NOT EXISTS screenshot_urls TEXT[],
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS auto_close_at TIMESTAMPTZ;

-- 2. MAKE chapter_id NULLABLE (allow standalone tickets)
ALTER TABLE nexus_foundation_issues
  ALTER COLUMN chapter_id DROP NOT NULL;

-- 3. UPDATE STATUS CHECK CONSTRAINT
ALTER TABLE nexus_foundation_issues DROP CONSTRAINT IF EXISTS nexus_foundation_issues_status_check;
ALTER TABLE nexus_foundation_issues
  ADD CONSTRAINT nexus_foundation_issues_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'awaiting_confirmation', 'closed'));

-- 4. AUTO-INCREMENT TICKET NUMBER VIA SEQUENCE + TRIGGER
CREATE SEQUENCE IF NOT EXISTS nexus_issue_ticket_seq START WITH 1;

-- Set sequence to max existing count
DO $$
DECLARE
  max_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO max_count FROM nexus_foundation_issues;
  IF max_count > 0 THEN
    PERFORM setval('nexus_issue_ticket_seq', max_count);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_nexus_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'NXS-' || LPAD(nextval('nexus_issue_ticket_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_nexus_ticket_number ON nexus_foundation_issues;
CREATE TRIGGER set_nexus_ticket_number
  BEFORE INSERT ON nexus_foundation_issues
  FOR EACH ROW
  EXECUTE FUNCTION generate_nexus_ticket_number();

-- 5. BACKFILL ticket_number for existing issues
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM nexus_foundation_issues
    WHERE ticket_number IS NULL
    ORDER BY created_at ASC
  LOOP
    UPDATE nexus_foundation_issues
    SET ticket_number = 'NXS-' || LPAD(nextval('nexus_issue_ticket_seq')::TEXT, 4, '0')
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 6. ADD activity log actions for new workflow
ALTER TABLE nexus_foundation_issue_activity DROP CONSTRAINT IF EXISTS nexus_foundation_issue_activity_action_check;
ALTER TABLE nexus_foundation_issue_activity
  ADD CONSTRAINT nexus_foundation_issue_activity_action_check
  CHECK (action IN (
    'created', 'assigned', 'accepted', 'delegated', 'returned',
    'marked_in_progress', 'resolved', 'reopened', 'comment',
    'confirmed', 'auto_closed'
  ));

-- 7. NEW NOTIFICATION EVENT TYPES
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_awaiting_confirmation';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_reopened';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_closed';

-- 8. INDEXES
CREATE INDEX IF NOT EXISTS idx_foundation_issues_ticket_number ON nexus_foundation_issues(ticket_number);
CREATE INDEX IF NOT EXISTS idx_foundation_issues_category ON nexus_foundation_issues(category);
CREATE INDEX IF NOT EXISTS idx_foundation_issues_auto_close ON nexus_foundation_issues(auto_close_at)
  WHERE status = 'awaiting_confirmation';
