-- Add video source type and SharePoint URL support to foundation chapters
-- Allows chapters to use either YouTube (existing) or SharePoint/Stream videos

-- Add video source column (defaults to 'youtube' for all existing rows)
ALTER TABLE nexus_foundation_chapters
  ADD COLUMN video_source TEXT NOT NULL DEFAULT 'youtube'
    CHECK (video_source IN ('youtube', 'sharepoint'));

-- Add SharePoint video URL column
ALTER TABLE nexus_foundation_chapters
  ADD COLUMN sharepoint_video_url TEXT;

-- Relax youtube_video_id NOT NULL constraint (SharePoint chapters won't have one)
ALTER TABLE nexus_foundation_chapters
  ALTER COLUMN youtube_video_id DROP NOT NULL;

-- Ensure data consistency: each source type has its required field
ALTER TABLE nexus_foundation_chapters
  ADD CONSTRAINT video_source_data_check CHECK (
    (video_source = 'youtube' AND youtube_video_id IS NOT NULL) OR
    (video_source = 'sharepoint' AND sharepoint_video_url IS NOT NULL)
  );
