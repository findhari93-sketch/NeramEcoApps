-- "Remind me on Friday to finish the catch-up." Stored here by the assistant;
-- the daily brief shows the ones due today and the M3 cron sends the rest
-- through sendNudge. status: queued -> sent. sent_via: 'brief' | 'cron'.

CREATE TABLE IF NOT EXISTS nexus_assistant_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES nexus_assistant_threads(id) ON DELETE SET NULL,
  due_on date NOT NULL,
  text text NOT NULL,
  kind text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'cancelled')),
  sent_at timestamptz,
  sent_via text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nar_status_due ON nexus_assistant_reminders (status, due_on);
CREATE INDEX IF NOT EXISTS idx_nar_user_due ON nexus_assistant_reminders (user_id, due_on);

ALTER TABLE nexus_assistant_reminders ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
