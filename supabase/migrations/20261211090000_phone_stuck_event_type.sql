-- "Stuck at phone sign-in" alert for staff (admin bell + phone push). Its own
-- file: a new enum value cannot be used in the same transaction that adds it.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'phone_stuck';
