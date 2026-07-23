-- ============================================
-- CLASS ABSENCES: WHO MISSED WHICH CLASS, AND WHAT HAPPENED NEXT
--
-- Everyone is attending by default (see 20260723090000), so a student who
-- simply does not turn up leaves no trace anywhere: no RSVP row, because they
-- never opted out, and no attendance row, because the Teams sync only records
-- who joined. The gap between the roster and the join list was invisible.
--
-- This table is that gap, made durable, plus the follow-up that hangs off it:
-- whether anyone asked why, what the student said, and whether they actually
-- caught up afterwards.
--
-- Two kinds, deliberately in one table:
--   no_show    down as attending, never joined. Needs chasing.
--   opted_out  said in advance they could not make it, with a reason. Needs the
--              recording, not a chase.
-- One table answers "who missed this class and why" without a union.
--
-- What is NOT stored here:
--   * Assignment completion, derived by joining nexus_assignment_submissions on
--     the class's linked assignments. Duplicating it would let the two disagree.
--   * Lateness, derived from nexus_attendance.joined_at against start_time.
--     A student who joined at 7:18 has an attendance row; they are not absent.
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_class_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Denormalised so "every absence in this classroom this term" does not have
  -- to join through the class table on every dashboard load.
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'no_show' CHECK (kind IN ('no_show', 'opted_out')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The reason, whether given in advance (copied from the RSVP) or afterwards
  -- when the student answers the follow-up. Same closed set as the RSVP, so the
  -- two can be charted together.
  reason_code TEXT CHECK (reason_code IS NULL OR reason_code IN ('unwell', 'family', 'clash', 'other')),
  reason_note TEXT,
  reason_submitted_at TIMESTAMPTZ,

  -- The chase. Written when a teacher sends, never by the cron: the cron drafts
  -- the list and stops, so nobody is messaged without a person deciding to.
  followup_sent_at TIMESTAMPTZ,
  followup_sent_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Catching up. recording_watched_at is written by the gated player;
  -- caught_up_at only by the student pressing the button, so "caught up" means
  -- they said so, not that a heuristic decided for them.
  recording_watched_at TIMESTAMPTZ,
  caught_up_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per student per class. The cron re-runs and must not accumulate.
  UNIQUE (scheduled_class_id, student_id)
);

-- The two hot reads: the teacher's list for one class, and one student's open
-- absences across the term (the "Needs your attention" section).
CREATE INDEX IF NOT EXISTS idx_class_absences_class
  ON nexus_class_absences(scheduled_class_id);
CREATE INDEX IF NOT EXISTS idx_class_absences_student_open
  ON nexus_class_absences(student_id, caught_up_at);
CREATE INDEX IF NOT EXISTS idx_class_absences_classroom
  ON nexus_class_absences(classroom_id, detected_at DESC);

DROP TRIGGER IF EXISTS nexus_class_absences_updated_at ON nexus_class_absences;
CREATE TRIGGER nexus_class_absences_updated_at
  BEFORE UPDATE ON nexus_class_absences
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- Service-role only; authorization happens in the API layer, matching every
-- other Nexus table.
ALTER TABLE nexus_class_absences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_class_absences;
CREATE POLICY "service_role_full_access" ON nexus_class_absences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Two new notification events: the teacher being told a list is waiting, and
-- the student being asked why they missed.
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
    'absence_reason_needed'
  ));
