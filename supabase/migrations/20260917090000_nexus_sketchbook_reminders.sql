-- Sketchbook reminders: the log that makes "quiet day 3, 6, 9, then a call" safe.
--
-- A "cycle" is one quiet stretch. It starts on the student's last drawing day
-- (or their tracking start if they never drew). A new drawing starts a new cycle,
-- so the steps start again from 1.
--
-- kind 'auto'    the 18:00 IST cron. step 1, 2 or 3. The unique indexes make a
--                rerun (or two overlapping runs) a no-op: a claim row is inserted
--                BEFORE sending, with ON CONFLICT DO NOTHING.
-- kind 'teacher' a teacher pressed Nudge on Class rhythm. Never a strike, but it
--                blocks that day's automatic send so nobody gets two.
--
-- nexus_sketchbook_digests: one evening digest per teacher per day.

CREATE TABLE IF NOT EXISTS nexus_sketchbook_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id uuid REFERENCES nexus_classrooms(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('auto', 'teacher')),
  sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  cycle_start date NOT NULL,
  step smallint CHECK (step BETWEEN 1 AND 3),
  quiet_days int NOT NULL,
  sent_on date NOT NULL,
  channel text,
  reasons jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nexus_sketchbook_reminders_step_for_auto CHECK ((kind = 'auto') = (step IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sbr_auto_step
  ON nexus_sketchbook_reminders (student_id, cycle_start, step) WHERE kind = 'auto';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sbr_auto_day
  ON nexus_sketchbook_reminders (student_id, sent_on) WHERE kind = 'auto';
CREATE INDEX IF NOT EXISTS idx_sbr_student_cycle
  ON nexus_sketchbook_reminders (student_id, cycle_start DESC);

CREATE TABLE IF NOT EXISTS nexus_sketchbook_digests (
  teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest_date date NOT NULL,
  sketches int NOT NULL,
  students int NOT NULL,
  needs_call int NOT NULL,
  channel text,
  reasons jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, digest_date)
);

ALTER TABLE nexus_sketchbook_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_sketchbook_digests ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
