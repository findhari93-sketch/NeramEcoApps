-- Add 'broadcast' value to marketing_content_type enum
-- Broadcast banners are displayed as a top bar on the marketing website
ALTER TYPE marketing_content_type ADD VALUE IF NOT EXISTS 'broadcast';
