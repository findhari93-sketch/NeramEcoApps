-- The message a teacher sends to a parent about pre-class work.
--
-- Own file, nothing else in it: ALTER TYPE ... ADD VALUE cannot share a
-- transaction with a statement that then uses the new value. See 20260721100000
-- and 20260728090200 for the same pattern and the bug that established it.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'prework_parent_alert';
