-- Phase 6: Add virtual_tour_scenes column for Platinum college 360° tours
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS virtual_tour_scenes JSONB DEFAULT NULL;

COMMENT ON COLUMN colleges.virtual_tour_scenes IS
  'Array of VirtualTourScene objects for Pannellum 360° viewer. Only populated for Platinum-tier colleges.
   Schema: [{ id, label, imageUrl, hotspots?: [{pitch, yaw, text, targetScene?}] }]';
