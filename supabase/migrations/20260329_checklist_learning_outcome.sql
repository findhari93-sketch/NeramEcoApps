-- Add learning_outcome field to checklist items
-- Allows teachers to specify what students should achieve by completing this item
ALTER TABLE nexus_checklist_items ADD COLUMN IF NOT EXISTS learning_outcome TEXT;
