-- The auto-first-touch cron writes a bell row "Auto First-Touch Sent" with this
-- event type, but no migration ever added it, so that insert failed silently.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'auto_first_touch_sent';
