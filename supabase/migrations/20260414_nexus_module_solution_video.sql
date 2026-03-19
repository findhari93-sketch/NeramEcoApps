-- Add solution video support to module items
-- Allows teachers to attach a YouTube (including unlisted) or SharePoint solution video

ALTER TABLE nexus_module_items
  ADD COLUMN IF NOT EXISTS solution_video_source TEXT CHECK (solution_video_source IN ('youtube', 'sharepoint')),
  ADD COLUMN IF NOT EXISTS solution_youtube_video_id TEXT,
  ADD COLUMN IF NOT EXISTS solution_sharepoint_video_url TEXT;

COMMENT ON COLUMN nexus_module_items.solution_video_source IS 'Source type for solution video: youtube or sharepoint';
COMMENT ON COLUMN nexus_module_items.solution_youtube_video_id IS 'YouTube video ID for solution video (supports unlisted)';
COMMENT ON COLUMN nexus_module_items.solution_sharepoint_video_url IS 'SharePoint sharing URL for solution video';
