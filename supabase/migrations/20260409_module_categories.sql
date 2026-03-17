-- Add category to modules for grouping (aptitude, drawing, math, custom)
ALTER TABLE nexus_modules
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
