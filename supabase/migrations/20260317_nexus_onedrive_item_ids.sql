-- Add OneDrive/SharePoint item IDs for file tracking
-- These store the Microsoft Graph item ID so files can be deleted from SharePoint

ALTER TABLE nexus_foundation_chapters
  ADD COLUMN IF NOT EXISTS pdf_onedrive_item_id TEXT;

ALTER TABLE nexus_module_items
  ADD COLUMN IF NOT EXISTS pdf_onedrive_item_id TEXT;

ALTER TABLE nexus_audio_tracks
  ADD COLUMN IF NOT EXISTS onedrive_item_id TEXT;
