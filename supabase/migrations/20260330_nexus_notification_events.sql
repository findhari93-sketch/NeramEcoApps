-- Add notification event types for Nexus classroom/batch operations
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'classroom_enrolled';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'batch_assigned';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'batch_changed';
