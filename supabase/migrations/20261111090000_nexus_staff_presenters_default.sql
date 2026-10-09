-- Who can present in a class meeting: teachers and staff, not only the organizer.
--
-- 2026-10-08: a class scheduled by one staff member and taught by another left
-- the teacher unable to share their screen, because every Nexus meeting was
-- created with allowed_presenters = 'organizer'. Nexus now sets Teams' "Specific
-- people" (roleIsPresenter) with every member of staff as a presenter; students
-- stay attendees, so the 2026-09-30 problem (a student's Share replacing the
-- teacher's screen) stays fixed.
--
-- The value is intent; the Teams meeting is the truth. Changing a row does not
-- change a meeting that already exists: POST /api/timetable/resync-presenters
-- does that for upcoming classes.

ALTER TABLE nexus_scheduled_classes
  ALTER COLUMN allowed_presenters SET DEFAULT 'roleIsPresenter';

-- Upcoming classes still on the old default follow the new one. Past classes
-- are history and are left alone.
UPDATE nexus_scheduled_classes
SET allowed_presenters = 'roleIsPresenter'
WHERE (allowed_presenters IS NULL OR allowed_presenters = 'organizer')
  AND scheduled_date >= CURRENT_DATE
  AND status IS DISTINCT FROM 'cancelled';
