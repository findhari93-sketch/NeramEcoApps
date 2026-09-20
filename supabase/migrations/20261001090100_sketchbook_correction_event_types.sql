-- ============================================
-- NOTIFICATION EVENT TYPES: sketchbook corrections
--
--   sketch_corrected    a teacher marked up a drawing and sent it back
--   sketch_retry_asked  a teacher asked for another try
--   sketch_retry_due    the by-when date passed with nothing submitted
--
-- Isolated in its own migration because ALTER TYPE ADD VALUE cannot share a
-- transaction with code that uses the new value. Additive and idempotent.
-- ============================================
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_corrected';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_retry_asked';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_retry_due';

NOTIFY pgrst, 'reload schema';
