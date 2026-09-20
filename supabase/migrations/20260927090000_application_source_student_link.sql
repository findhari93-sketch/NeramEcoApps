-- A new application_source for a form the student filled in themselves, from a link
-- staff sent them.
--
-- Alone in its own migration on purpose. ALTER TYPE ... ADD VALUE cannot share a
-- transaction with code that then uses the new value, so the value has to be
-- committed before 20260927090100 (and before any route) can write it. Same reason
-- as 20260916090000_notification_event_types_fix.sql.
--
-- Why not reuse 'manual': 'manual' means a member of staff typed it in. Knowing the
-- student confirmed their own details is the whole point of the link, and it is what
-- lets us tell a chased record from an office-entered one later.

ALTER TYPE public.application_source ADD VALUE IF NOT EXISTS 'student_link';
