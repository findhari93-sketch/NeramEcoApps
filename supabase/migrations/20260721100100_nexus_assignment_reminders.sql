-- ============================================
-- NEXUS ASSIGNMENT REMINDERS (sent-log)
-- Records every assignment reminder sent to a student: who was reminded, when,
-- by which staff member, over which channel, and from which template. This is the
-- shared "already reminded" history that lets any staff member (teacher, office
-- admin) see prior nudges on the assignment page and avoid double-nagging the same
-- student. Teams activity-feed sends are otherwise invisible to our DB, so this is
-- the only durable record of a reminder having gone out.
--
-- Accessed only via the service-role admin client, so RLS is enabled with no
-- policy (default-deny for anon/authenticated; service role bypasses RLS).
-- ============================================
CREATE TABLE IF NOT EXISTS nexus_assignment_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES nexus_class_assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  channel       TEXT,
  template      TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_assignment_reminders_assignment
  ON nexus_assignment_reminders(assignment_id);
CREATE INDEX IF NOT EXISTS idx_nexus_assignment_reminders_assignment_student
  ON nexus_assignment_reminders(assignment_id, student_id);

ALTER TABLE nexus_assignment_reminders ENABLE ROW LEVEL SECURITY;
