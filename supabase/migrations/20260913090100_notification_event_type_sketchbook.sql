-- ============================================
-- NOTIFICATION EVENT TYPES: sketchbook
--
--   sketch_reaction      a teacher reacted to a sketch
--   sketch_featured      a teacher featured a sketch to the class
--   sketch_rhythm_nudge  the weekly "two days short" reminder (phase 2 cron)
--   sketch_milestone     7, 30 or 100 sketches (phase 2)
--
-- Isolated in its own migration because ALTER TYPE ADD VALUE cannot share a
-- transaction with code that uses the new value. Additive and idempotent.
-- ============================================
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_reaction';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_featured';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_rhythm_nudge';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_milestone';

NOTIFY pgrst, 'reload schema';
