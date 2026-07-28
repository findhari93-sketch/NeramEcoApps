-- Chronic pre-class non-completion, queued for a teacher to act on.
--
-- The teacher's ask: "if they are doing it for very long time not completing, we
-- want to let the parent know". The machine does the noticing; a person does the
-- contacting. That split is not a compromise, it matches the contract stated in
-- api/cron/class-followups, which is emphatic that a cron may draft a list but
-- never messages a human on its own.

CREATE TABLE IF NOT EXISTS nexus_prework_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,

  -- A SNAPSHOT of the case that was made, not a live count. A teacher opening
  -- the queue next Tuesday needs to read what actually triggered it, not a
  -- number recomputed against a window that has since rolled past it.
  missed_count INTEGER NOT NULL DEFAULT 0,
  applicable_count INTEGER NOT NULL DEFAULT 0,
  explained_count INTEGER NOT NULL DEFAULT 0,
  started_claims INTEGER NOT NULL DEFAULT 0,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'notified', 'dismissed', 'resolved')),

  -- Written ONLY by a person pressing "Notify parent". The cron never sets these.
  parent_notified_at TIMESTAMPTZ,
  parent_notified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- NULL means no parent account was linked at the time. That is today's normal
  -- state and must read as "recorded but not sent", never as a failure.
  parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One open case per student per classroom. Also the concurrency guard: two
  -- teachers pressing Notify parent at once cannot create two rows to send from.
  UNIQUE (student_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_prework_escalations_classroom_open
  ON nexus_prework_escalations(classroom_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_prework_escalations_student
  ON nexus_prework_escalations(student_id);

DROP TRIGGER IF EXISTS nexus_prework_escalations_updated_at ON nexus_prework_escalations;
CREATE TRIGGER nexus_prework_escalations_updated_at
  BEFORE UPDATE ON nexus_prework_escalations
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

ALTER TABLE nexus_prework_escalations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_prework_escalations;
CREATE POLICY "service_role_full_access" ON nexus_prework_escalations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The teacher's roll-up event. The full list is re-issued because this is a
-- CHECK, not an enum: dropping a value that is already in use would silently
-- break a working notification path, so every existing value is repeated here.
ALTER TABLE nexus_timetable_notifications
  DROP CONSTRAINT IF EXISTS nexus_timetable_notifications_event_type_check;
ALTER TABLE nexus_timetable_notifications
  ADD CONSTRAINT nexus_timetable_notifications_event_type_check
  CHECK (event_type IN (
    'rsvp_attending',
    'rsvp_not_attending',
    'class_created',
    'class_cancelled',
    'class_rescheduled',
    'holiday_marked',
    'recording_available',
    'review_submitted',
    'assignment_published',
    'assignment_reviewed',
    'assignment_nudge',
    'week_published',
    'class_missed_followup',
    'absence_reason_needed',
    'catchup_needs_attention',
    'catchup_no_recording',
    -- New: students whose pre-class work has become a pattern.
    'prework_needs_attention'
  ));

NOTIFY pgrst, 'reload schema';
