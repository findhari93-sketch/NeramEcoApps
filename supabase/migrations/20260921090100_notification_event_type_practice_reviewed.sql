-- A teacher reviewed a practice drawing (a sketch, a question bank drawing,
-- free practice or homework) from the one review screen.
-- Additive and idempotent. ADD VALUE IF NOT EXISTS is safe to re-run and is
-- kept in its own file so no statement in the same transaction uses the value.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'practice_reviewed';
