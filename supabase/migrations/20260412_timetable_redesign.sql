-- Timetable Redesign: Holidays + Timetable Notifications
-- 2026-04-12

-- ============================================================
-- 1. Classroom Holidays
-- ============================================================

CREATE TABLE IF NOT EXISTS nexus_classroom_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(classroom_id, holiday_date)
);

CREATE INDEX idx_nexus_holidays_classroom ON nexus_classroom_holidays(classroom_id);
CREATE INDEX idx_nexus_holidays_date ON nexus_classroom_holidays(holiday_date);

ALTER TABLE nexus_classroom_holidays ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_holidays" ON nexus_classroom_holidays
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Timetable Notifications (separate from global user_notifications)
-- ============================================================

CREATE TABLE IF NOT EXISTS nexus_timetable_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'rsvp_attending',
    'rsvp_not_attending',
    'class_created',
    'class_cancelled',
    'class_rescheduled',
    'holiday_marked',
    'recording_available',
    'review_submitted'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nexus_tt_notif_user ON nexus_timetable_notifications(user_id, is_read);
CREATE INDEX idx_nexus_tt_notif_classroom ON nexus_timetable_notifications(classroom_id);
CREATE INDEX idx_nexus_tt_notif_created ON nexus_timetable_notifications(created_at DESC);

ALTER TABLE nexus_timetable_notifications ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_tt_notif" ON nexus_timetable_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);
