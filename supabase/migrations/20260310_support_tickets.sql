-- ============================================
-- Support Ticket System
-- ============================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_priority AS ENUM (
    'low',
    'medium',
    'high'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_category AS ENUM (
    'enrollment_issue',
    'payment_issue',
    'technical_issue',
    'account_issue',
    'course_question',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. SUPPORT TICKETS TABLE
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-readable ticket ID (e.g., NERAM-TKT-00001)
  ticket_number TEXT NOT NULL UNIQUE,

  -- Who raised this ticket
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  user_phone TEXT,

  -- Ticket details
  category support_ticket_category NOT NULL DEFAULT 'other',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Context (auto-populated by the component)
  page_url TEXT,
  source_app TEXT,

  -- Enrollment link context (when raised from enrollment error)
  enrollment_link_id UUID REFERENCES direct_enrollment_links(id) ON DELETE SET NULL,

  -- Screenshots (Supabase Storage paths)
  screenshot_urls TEXT[] DEFAULT '{}',

  -- Status tracking
  status support_ticket_status NOT NULL DEFAULT 'open',
  priority support_ticket_priority NOT NULL DEFAULT 'medium',

  -- Assignment
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  -- Resolution
  resolution_notes TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TICKET COMMENTS (for back-and-forth)
CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_tickets_enrollment_link
  ON support_tickets(enrollment_link_id)
  WHERE enrollment_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_ticket_comments_ticket_id
  ON support_ticket_comments(ticket_id);

-- 5. SEQUENCE + TRIGGER for ticket numbers
CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number := 'NERAM-TKT-' || LPAD(nextval('support_ticket_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ticket_number ON support_tickets;
CREATE TRIGGER set_ticket_number
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
  EXECUTE FUNCTION generate_ticket_number();

-- Updated_at trigger (reuse existing function)
CREATE OR REPLACE TRIGGER set_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 6. RLS POLICIES
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_comments ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to tickets"
  ON support_tickets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to ticket comments"
  ON support_ticket_comments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can create tickets (for unauthenticated enrollment error pages)
CREATE POLICY "Anyone can create tickets"
  ON support_tickets FOR INSERT
  TO anon
  WITH CHECK (true);

-- 7. ADD NOTIFICATION EVENT TYPES
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'ticket_created';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'ticket_resolved';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'link_regeneration_requested';

NOTIFY pgrst, 'reload schema';
