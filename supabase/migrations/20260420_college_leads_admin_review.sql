-- Admin review gate for student-to-college interest submissions.
-- Colleges only see leads after a Neram staff member approves them.
-- Applied to staging and production on 2026-04-20 via Supabase MCP before
-- this migration file was committed to git.

ALTER TABLE college_leads
  ADD COLUMN IF NOT EXISTS admin_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (admin_review_status IN ('pending','approved','rejected','spam')),
  ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_college_leads_review_status ON college_leads(admin_review_status);
