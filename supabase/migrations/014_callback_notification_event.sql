-- Migration 014: Add 'new_callback' to notification_event_type enum
-- This allows callback requests to trigger the unified notification system

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'new_callback';
