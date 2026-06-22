-- Nexus "View as Student" (impersonation) audit log.
-- Each row records one impersonation session: a teacher/admin (impersonator_id)
-- stepping into a real student's account (student_id) to reproduce/fix an issue,
-- optionally initiated from a support ticket (ticket_id -> nexus_foundation_issues).
-- Writes performed while impersonating are attributed to the student, so this log
-- is the trace of who acted as whom and when.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS nexus_impersonation_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT,
  ticket_id       UUID REFERENCES nexus_foundation_issues(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Look up the open session for a (impersonator, student) pair when ending it,
-- and list recent sessions per student/impersonator for audit views.
CREATE INDEX IF NOT EXISTS idx_nexus_impersonation_impersonator
  ON nexus_impersonation_sessions(impersonator_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_impersonation_student
  ON nexus_impersonation_sessions(student_id, started_at DESC);

-- RLS on: the app reaches this table only through the service-role admin client
-- (which bypasses RLS). No anon/authenticated policies, so it is closed by default.
ALTER TABLE nexus_impersonation_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE nexus_impersonation_sessions IS 'Audit log for Nexus "View as Student": who impersonated which student, when, and why.';
COMMENT ON COLUMN nexus_impersonation_sessions.impersonator_id IS 'The teacher/admin who initiated the impersonation.';
COMMENT ON COLUMN nexus_impersonation_sessions.student_id IS 'The student whose account was viewed/used.';
COMMENT ON COLUMN nexus_impersonation_sessions.reason IS 'Free text, e.g. "Ticket TKT-0042".';
COMMENT ON COLUMN nexus_impersonation_sessions.ticket_id IS 'Optional nexus_foundation_issues.id when started from a support ticket.';
COMMENT ON COLUMN nexus_impersonation_sessions.ended_at IS 'Set when the impersonator exits student view (best-effort).';
