-- The bell and Teams event for "your teacher needs more from you on a ticket".
--
-- Alone in its own file on purpose: Postgres cannot use a new enum value inside
-- the transaction that adds it, and a migration file runs as one transaction.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_info_requested';
