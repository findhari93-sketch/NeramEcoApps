-- Add is_published column to nexus_checklists
-- Checklists default to draft (false). Only published checklists are visible to students.
ALTER TABLE nexus_checklists
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
