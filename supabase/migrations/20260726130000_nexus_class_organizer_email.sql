-- Store the real Teams meeting organizer's email alongside organizer_name, so
-- attendance/recording sync can resolve the correct organizer for the app-only
-- Graph lookup instead of assuming it is always the assigned teacher.
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS organizer_email TEXT;
