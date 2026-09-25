-- Homework reminders: one plan per (class, student) for students who came to a
-- class and have not handed its homework in.
--
-- A teacher presses Remind on the class's Attended tab: one message goes now and
-- a plan starts with next_on = today + every_days (IST). The evening cron
-- (api/cron/homework-reminders) sends again on next_on and moves it on, and ends
-- the plan the day the student hands everything in (end_reason 'handed_in'),
-- leaves the classroom ('left'), the homework is withdrawn ('no_homework'), or a
-- teacher presses Stop ('stopped'). Pressing Remind again restarts an ended plan.
--
-- The cron CLAIMS a send by moving next_on with a conditional update
-- (WHERE next_on <= today AND ended_at IS NULL), so two overlapping runs cannot
-- both send. Each send is also logged in nexus_assignment_reminders, which the
-- assignment page already reads as "reminded N times".
--
-- Service-role only: RLS on, no policy.

CREATE TABLE IF NOT EXISTS nexus_homework_reminder_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id uuid NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  classroom_id uuid REFERENCES nexus_classrooms(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  every_days smallint NOT NULL DEFAULT 3 CHECK (every_days BETWEEN 1 AND 14),
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  next_on date NOT NULL,
  sends int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  last_channel text,
  ended_at timestamptz,
  end_reason text CHECK (end_reason IN ('handed_in', 'stopped', 'left', 'no_homework')),
  ended_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nexus_homework_reminder_plans_one_per_student UNIQUE (scheduled_class_id, student_id),
  CONSTRAINT nexus_homework_reminder_plans_end_has_reason CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_hw_reminder_plans_active
  ON nexus_homework_reminder_plans (next_on)
  WHERE ended_at IS NULL;

ALTER TABLE nexus_homework_reminder_plans ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
